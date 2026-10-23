# A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent

Part of the [UI/UX review](README.md). 51 findings: 0 critical, 9 high, 21 medium, 21 low.

## How it should work

Start from one sentence: every unit is occupied, on notice or vacant, and every turnover step follows from which one it is. Two small records carry that. A Unit has a stable id, a short name, beds, baths, access and utilities. A Tenancy has names, start, end, notice date and rent. Occupancy is computed from dates, as Zillow Rental Manager derives Future or Active from a tenancy period (https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb). Each status carries its own date, the way Stripe writes 'Trial ends 19 Dec' in a fixed column (https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6). Occupied stays quiet.

The Units tab is one table: Unit, Status, Tenant, Rent, Lease ends, Next. A row opens a unit sheet shaped like a Resend record (https://mobbin.com/screens/046759e2-bf3e-4fd5-899f-a115278d5f8c): identity, a strip of facts, then one turnover strip (Notice, Out, Turn, Listed, Signed, In, First rent) with dates under done steps and hollow future steps, as Brex draws them (https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811). History reads as Attio change rows, 'Rent $1,100 → $1,200' (https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775).

Two verbs run the turn. Record notice and Start tenancy are short sheets whose Summary pane lists every dated consequence before you confirm, like Stripe's Create subscription preview (https://mobbin.com/screens/ced08fbe-5237-45aa-95b4-d23785e59e4e). A notice can be withdrawn from the header, as Stripe offers Cancel refund (https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b). The turn gets a Ready by date; when it slips, the old date is struck through as in Flighty (https://mobbin.com/screens/735a1c2a-4ed9-48c1-9ddb-b4d1ca513432) and the listing's available date follows.

The listing is the vacant unit's state, and it can't go public until rent, beds, baths, a photo and a date exist. Airbnb's Complete required steps card (https://mobbin.com/screens/2e723699-3115-4cf5-8f89-7ad3a61509df) replaces today's three 'Price on request' cards.

Tenants see the same journey from their side. The personal move-in page is a Wise timeline in you and we sentences (https://mobbin.com/screens/ea2fde3e-8b3e-4ef8-92d9-ea5dc9e51fda). The move-in report asks for a photo per room with Skip, as Thumbtack does (https://mobbin.com/screens/bada6ed2-d3d3-4209-b332-354d4e16c6db), and is stored on the tenancy, so the move-out walkthrough compares room by room and turns each worsened item into a turn task. A Moving out page borrows Airbnb's checkout instructions (https://mobbin.com/screens/748d238c-16f7-42dd-9417-edac08fb7d48) and collects the forwarding address for the deposit statement.

The turn closes on first rent: 'First rent $1,200 expected around Dec 1', Copilot's sentence (https://mobbin.com/screens/b8ee0b14-088d-407e-88ee-627b31d1bd7e), ticks to Received. Baselane keeps money and leases; HG keeps who, when and how much. Home gets person-first rows on move days, the way Airbnb Today says a guest checks in (https://mobbin.com/screens/a712767b-113c-4ead-875d-40a5fa2f9830).

<details><summary>What the reviewer covered</summary>

Production build on localhost:3200, Chromium only (no WebKit pass), signed in as Connor. Routes and states covered: /properties/cmtg25y4p0006jphsv3frndk6 (767 Prospect) at desktop 1280 (header, Units & access, Rentals, Tasks card read through the aria tree), Rentals edit mode plus '+ Add listing' at 1280 and 375 (the unit select's options read with eval; Save was not clicked), 375 Units, 768 Units and Rentals, and 320 in dark mode with Utilities expanded. /properties/cmtg25y4m0003jphsrpe7xpb8 (647 Prospect): Rentals and Tasks at 1280 and 768. 58 Mariner and 15 Oxford: Units at 1280. /rentals at 1280, 768 and 375 signed out. /residents/moving-in at 1280 and 375, with the property select's 11 options read through eval. /tasks?q=[Tenant], ?q=move out and ?q=tenant&status=all at 1280 and 375 with aria, plus 768. /financials/rent-roll, /properties and / at 1280, 768 and 375. Read-only queries on the local DB covered Property.units labels and unitCount, every Listing row (status, rent, available date, photo count), the 'NEW MOVE OUT [Address]' (6) and 'NEW TENANT [Address]' (10) template rows, and 767 Prospect's tenant task history: the Dan to ZeChen turn in Oct and Nov 2025 and the Maritza/BMHA rent tasks. Code read: property-types.ts, the schema (Property, Listing), the property page, edit-listings.tsx, edit-units.tsx, properties/service.ts (replaceUnits, replaceListings), the rentals page, the moving-in page and actions, the rent-roll page, quickbooks/queries.ts getRentRoll, property-page-plan §2, and Asana spec D10, D21, D28 and the Task.unitLabel data model. Mobbin: 12 searches (Zillow Rental Manager web and iOS, Stripe subscriptions and customer, Xero, Contractbook, GoDaddy, Vanta, Airbnb, Turo, Linear Mobile, Perplexity, Unity, WRITER). Not reachable: the D10 Units tab and the Task unit field (not built in this branch), Baselane and Zillow (external), a submitted move-in report (writes blocked; the local DB has none), and real rent data (the rent tab shows Portfolio $0 and the sync is 51 days old).

</details>

## Findings

### G2C-001

**Give each unit a stable id before the task Unit field ships on Oct 28**

High · Fix · effort S · `Data model: units referenced by listings, the planned task Unit field (ships Oct 28) and CapEx` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. Partly fixed in 9f74ea1: every unit in Property.units gets a stable id on its next save, and a rename carries to the property's tasks and listings in the same transaction when the old and new labels are each unique. Still open: Task.unitLabel and Listing.unitLabel are still free-text labels with no unitId, and the lockbox code is still resolved by label. Removing a unit doesn't ask first, and a non-unique rename or a removal still leaves stale labels, so the lockbox card disappears without warning. The unitId columns are a schema decision for Connor. The task Unit field has shipped on the branch as free text. Task.unitLabel is a String that 'matches a Property.units[].label' (schema.prisma:263), and Listing.unitLabel is still free text (schema.prisma:650). resolveLockboxCode matches units by label, ignoring case (lockbox.ts:12-19), and replaceUnits still rewrites the units JSON with no stable id (properties/service.ts:200-216). If a unit is renamed (say 'Rear' on 118 Congress St., /properties/cmtg25y4k0002jphsxww4tv6k), its tasks keep the old label. lockboxState then returns 'none' (lockbox.ts:34), so the contractor's job page drops the lockbox card without warning. The staff rail's Lockbox row also disappears instead of saying 'Pick a unit', while the Unit chip still shows the stale label (fields.tsx:132-143).
- **Today:** Unit identity is a free-text label everywhere (Property.units JSON, Listing.unitLabel, and the planned Task.unitLabel, which lands with the schema batch approved Sat Oct 24 and feeds the D21 lockbox lookup on Oct 28/29). Renaming a unit orphans its listing, and its tasks would show no lockbox code.
- **Why:** Every turnover step has to point at one unit: the notice, the contractor's turn job and its lockbox code, the listing, the move-in report and the rent. String matching breaks silently on a rename, so a contractor sees the wrong code or none, and no occupancy roll-up can be trusted. Doing this before Oct 28 costs hours. Doing it after means migrating imported tasks.
- **Change:** Before the task page ships, give every object in Property.units an id (cuid) that replaceUnits writes once and never edits. Store Task.unitId and Listing.unitId instead of labels, resolve the D21 code by id, and look up the unit's current name wherever it's shown. Removing a unit that an open task or a listing points at asks first: 'Rear has an open task and a listing. Remove it anyway?' This is the interim step toward the Unit table in G2C-002 and needs no visible UI change.
- **Desktop, tablet, phone:** No visual change at 1280, 768 or 375. The unit pickers on the task rail and in the listing editor show the same names as today.
- **Reuse:** Extend src/lib/properties/service.ts replaceUnits and replaceListings. Change the spec's Task field (asana-migration-plan.md:227) from unitLabel to unitId. Use ConfirmDialog for the remove warning.
- **Challenges:** Approved Asana migration spec data model: Task.unitLabel as free text (asana-migration-plan.md:227)
- **Code:** `src/lib/property-types.ts:19-24`, `prisma/schema.prisma:297`, `src/app/(app)/properties/[id]/edit-listings.tsx:276`, `src/app/(app)/properties/[id]/edit-units.tsx:117`, `branch: docs/asana-migration-plan.md:82 (D21), :227 (Task.unitLabel), :476 (ships Oct 28)`, `Local DB read: Listing at 933 Lafayette has unitLabel 'Floor 1'; units there are 'Floor 1 | Floor 2'`, `branch: prisma/schema.prisma:263`, `branch: prisma/schema.prisma:650`, `branch: src/lib/tasks/lockbox.ts:12-35`, `branch: src/lib/properties/service.ts:200-216`, `branch: src/app/(app)/tasks/[id]/fields.tsx:124-167`
- **Verification:** partly. Code and data check out: Listing.unitLabel has no FK (schema.prisma:297), the editor keeps a stale label as an extra option (edit-listings.tsx:276), EditUnitCard uses key={i} (edit-units.tsx:117), and spec line 227 adds Task.unitLabel. Two corrections. The deadline is tighter than stated: Task.unitLabel lands in the schema batch that Connor approves on Sat Oct 24 (plan row 2), not on Oct 28, so this has to go into that batch. And 'wrong code' is overstated: under D21 a label that no longer matches shows no code, and a wrong code only appears if labels get reused. Interaction to flag: G2C-019's renames would orphan the live 767 listing ('1st Front / Lower Front') under today's string matching, so ids have to come first. A fix needs no Mobbin reference.

### G2C-002

**Add one Tenancy record per lease and compute occupancy from its dates**

High · New capability · effort L · `Data model: unit occupancy (feeds the D10 Units tab, Home, Portfolio and rent)` · Rentals, residents and the public site run one lifecycle

- **Today:** No field records who lives in a unit, when they leave or what they pay. Turnovers live in task titles (the 2025 Dan to ZeChen turn at 767), and the rent tab says lease data is out of scope. The three Available listings date from the Aug 31 import but match units that appear vacant, so no drift has happened yet.
- **Why:** No screen answers 'who is in each unit and what's next'. property-page-plan §2 proposes a Unit with a stored occupancyStatus (Occupied, Vacant, Notice given, Turning). A typed status drifts the first time someone forgets to change it, which is what happened to the three listings that have read Available since the Aug 31 import. Zillow Rental Manager stores a tenancy period and derives Future or Active from its dates, and Stripe derives subscription state from period dates. Computing the state is what keeps it true.
- **Change:** Add Tenancy {id, unitId, tenantNames (one text field, e.g. 'Harrison, Jen'), phone (optional, for entry notices), startDate, endDate (empty means month to month), noticeOn, rent, baselaneUrl}. Compute occupancy, never type it. No tenancy covering today means Vacant, or 'Leased, moves in Dec 1' when a future one exists. A current tenancy with noticeOn set means Notice, out on endDate. Anything else is Occupied. Drop 'Turning' as a status: turn work shows as the unit's Next item (G2C-003). Everything else reads the unit's current tenancy: its end date drives Home's 'Lease ends in 60 days', its absence drives Portfolio vacancy and the default listing, its id goes into the move-in link, and its rent is the expected rent. Promote Property.units to a Unit table in the same migration, carrying over the ids from G2C-001.
- **Desktop, tablet, phone:** Data only. G2C-003, G2C-009, G2C-010 and G2C-013 define each surface at 1280, 768 and 375.
- **Reuse:** New model following docs/property-page-plan.md §2, minus occupancyStatus, depositHeld and marketRent (deposits stay in Baselane, see G2C-017). The pattern comes from Zillow's tenancy period.
- **References:** 
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): Tenancy period stores Start date and End date; Status (FUTURE) is derived, not chosen
  - [Zillow](https://mobbin.com/flows/811e247b-dabf-4fc6-bb6b-dca07999dfed): A tenancy is created from three inputs: lease term, lease start, tenant name
  - [Stripe](https://mobbin.com/screens/bc21762d-28b7-487c-b34e-7973e5e7e4b9): Status pill carries its date ('Trial ends 8 Jan 2025'), computed from the period
- **Code:** `src/app/(app)/financials/rent-roll/page.tsx:29-33`, `src/lib/property-types.ts:19-24`, `docs/property-page-plan.md:67-80`, `Local DB, 767 Prospect task history: 'Dan unit walkthrough' (done Oct 28 2025), 'list Dan's unit' (Nov 4), 'Get [ZeChen 767 Prospect] on Baselane' (Nov 10)`
- **Verification:** partly. Confirmed that no field records occupancy, and the rent-roll page quote is exact (rent-roll/page.tsx:29-33). The Zillow reference is real (2a203487 shows a Tenancy period with Start, End and a derived FUTURE status). The drift example is unsupported. All three listings are for units that look actually vacant: Melvin left 933 Floor 1 around Aug 25, 647 Rear has the open 'Find a new tenant rear unit', and 767 1st Front has utilities in HG's name. Nothing shows a stale status yet. The finding should also own its main cost: names, dates and rent already live in Baselane (its own G2C-017 principle), so every lease is double-entered by hand. State that the Tenancy is the one deliberate copy and keep only the fields that drive a date or an alert. A separate Tenancy table, rather than flat fields on Unit as in property-page-plan §2, is justified because Notice plus a future Leased tenancy can overlap.

### G2C-004

**Add 'Record notice' so a tenant's notice sets the move-out date and starts the turn**

High · New capability · effort M · `Property hub: unit sheet and Units row menu` · Rentals, residents and the public site run one lifecycle

- **Today:** There's nowhere to record that a tenant gave notice, so it becomes a free-text task: 933 Lafayette's 'New tenant for lower (melvin move out)' and 647 Prospect's 'Find a new tenant rear unit', each sitting next to a listing that already says Available. The MOVE OUT playbook is 6 template rows under 'NEW MOVE OUT [Address]'. It's copied by hand with [tenant] typed into each title, and its steps carry no dates.
- **Why:** The notice sets every later date: the walk-through, the deposit return, the paint job, the listing's available date. Captured as prose, that date is lost. Xero's 'Cancellation due on 14 Jun 2026' chip and Perplexity's 'cancel at the end of my billing period' show the pattern: set one date once, and the record shows it until the day comes.
- **Change:** From an occupied unit's sheet or row menu, open a sheet with three inputs. Move-out date has quick picks: 'End of lease (Jun 30)', 'End of this month', or a date. Notice received defaults to today. Two options start checked: 'Apply Move out playbook' (the unit and tenant are filled in and due dates come from the move-out date, per G1C-005) and 'Draft the listing' (G2C-007, available the day after move-out). On save, show 'Notice recorded for Front. Moves out Nov 30.' with Undo. The row then reads 'Notice, out Nov 30'. Don't create a 'find a tenant' task: the unit's state is the to-do.
- **Desktop, tablet, phone:** 1280: a 420px right sheet over the hub. 768: the same sheet at 60% width. 375: a bottom sheet with the date quick picks as full-width rows and a sticky Save.
- **Reuse:** The Apply playbook flow (D28, G1C-006) for the steps. Due-date quick picks from MOBILE-035. ConfirmDialog grown into the Dialog shell and an Undo toast (both listed under Known gaps in docs/components.md). React Aria sheet (approved).
- **References:** 
  - [Stripe](https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6): Status chip carries its own date ('Trial ends 19 Dec') in a fixed Status column, and the action ends on a 'Subscription started · View' toast. Model for 'Notice, out Nov 30' after Record notice.
  - [Zillow](https://mobbin.com/screens/729c5e01-38db-440b-a6cc-1b5ee4299140): Add tenants is a short dialog (lease term, lease start, tenant) over the property page, with the Next steps rail still visible behind. Right size for the three-field Record notice sheet.
  - [Xero](https://mobbin.com/screens/c5512606-2926-4555-8ec1-38a4ffb03a2f): 'Cancellation due on 14 Jun 2026' as a dated status on the row
  - [Perplexity](https://mobbin.com/screens/014da984-12a4-49a6-aaad-4bedb1c84082): One option card: ends at the end of the period, with the date spelled out
  - [Zillow](https://mobbin.com/flows/811e247b-dabf-4fc6-bb6b-dca07999dfed): A short dialog over the property page, ending on a toast
- **Code:** `Local DB: 6 template rows in section 'NEW MOVE OUT [Address]', all undated`, `asana-migration-plan.md:89 (D28)`
- **Verification:** confirmed. DB confirms 6 undated MOVE OUT template rows with [tenant] placeholders. The 933 and 647 free-text tasks sit beside Available listings. Spot-checked Xero c5512606: a real 'Cancellation due on 14 Jun 2026' chip on the row, a good fit. Record notice and Start tenancy are the only ways the model stays true, so the severity follows G2C-002. Its move-out date is also what G2C-012's legal deposit deadline needs.

### G2C-005

**Add 'Start tenancy' to close the turn: listing down, NEW TENANT steps, move-in link**

High · New capability · effort M · `Property hub: unit sheet (vacant or notice unit)` · Rentals, residents and the public site run one lifecycle

- **Today:** Nothing in the app follows a signed lease: the listing stays Available until someone edits Rentals, the NEW TENANT steps need the name typed into each, and the resident picks a property with no unit on the move-in form. The three current Available listings appear to be accurate vacancies, not stale ones.
- **Why:** One action should close the turn and set up what follows. Zillow's Add tenants dialog is three inputs and produces the tenancy, a toast and next steps. Turo's 'Your listing is live' screen ends on what to do next. Without this action, the listing, the playbook and the move-in report each need a separate trip.
- **Change:** From a vacant or notice unit, open a sheet with Tenant names, Start date, End date (or Month to month) and Rent (prefilled with the listing's asking rent). On save: the listing changes to Leased and leaves /rentals immediately; the row reads 'Leased, moves in Dec 1', then 'Occupied' from that day; NEW TENANT is offered with names and unit filled in and due dates counted from the start date; and the unit sheet shows 'Copy move-in link' for this tenancy (PUBLIC-045's personal link), so the report lands on this unit. End on the payoff in G2C-032.
- **Desktop, tablet, phone:** Same sheet as G2C-004: right sheet at 1280, 60% at 768, bottom sheet with a sticky Save at 375.
- **Reuse:** Apply playbook (D28), the Listing row, PUBLIC-045's link, the Dialog shell and a toast (Known gaps in docs/components.md).
- **References:** 
  - [Stripe](https://mobbin.com/screens/ced08fbe-5237-45aa-95b4-d23785e59e4e): Create a subscription takes a date range (5 Dec 2024 → Forever) and a billing start, with a Summary pane listing 'Subscription starts' and 'First invoice'. Same shape as Start tenancy: lease dates in, first rent and steps previewed.
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): After adding tenants: 'Tenants added successfully' toast, the tenancy row shows FUTURE, and Next steps offers 'Create a property condition report'. Shows how Start tenancy should hand off to the move-in report.
  - [Zillow](https://mobbin.com/flows/811e247b-dabf-4fc6-bb6b-dca07999dfed): Add tenants: lease term, start, names; then a toast and a Tenancy period row
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): Next steps card after a tenant is added (condition report, rent payments)
  - [Turo](https://mobbin.com/screens/361a77ec-41f2-4e64-9dc9-3e94bffbf6ad): Payoff that says the listing is live and what to do before the first trip
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:36-45`, `src/app/(marketing)/residents/moving-in/actions.ts:107-115`, `Local DB: 10 template rows in section 'NEW TENANT [Address]'; all 3 Listing rows AVAILABLE with updatedAt 2026-08-31`
- **Verification:** partly. The move-in form has no unit and uses a property select (actions.ts:36-45). The submitted report becomes a task with no unit (actions.ts:107-115). Listings only change by hand. The implied staleness doesn't hold up: the three Available listings appear to be correctly vacant units today. Zillow's Add tenants flow (lease term, start, names, then a toast and Next steps) is real and fits.

### G2C-012

**Anchor the deposit return to move-out plus 14 days**

High · New capability · effort S · `MOVE OUT playbook steps, applied from Record notice` · Rentals, residents and the public site run one lifecycle

- **Today:** MOVE OUT's 'Create list of all deductions' and 'Return security deposit' steps carry no dates. Recent turns show the 14-day window missed: Abbey at 647 (out Jul 28 2026, deposit returned Aug 25), Nico at 647 (walk-through Aug 4, deductions Aug 25), and the 118 Congress rear unit (walk-through Oct 9 2025, deposit returned Nov 4 to 6). Dan's same-day return in 2025 was the exception.
- **Why:** New York General Obligations Law 7-108 requires an itemized statement and the deposit back within 14 days after the tenant leaves, or the landlord can lose the right to keep any of it. The move-out date from G2C-004 turns this into a computed due date instead of something to remember.
- **Change:** In the MOVE OUT template, give 'Itemize deductions' a due offset of move-out + 10 days and 'Return deposit' + 14 days. The task row shows 'Due Dec 14' like any other task and turns overdue on Home like any other task. The OS holds no deposit balance or ledger; Baselane holds the money (G2C-017).
- **Desktop, tablet, phone:** Task rows at every width.
- **Reuse:** G1C-005's due offsets and the existing task rows.
- **References:** 
  - [Brex](https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811): Status timeline ends on a hollow future step with its date ('Payment estimated on Jan 22, 2025'). The deposit step reads 'Deposit statement due Dec 14'.
  - [Wise](https://mobbin.com/screens/ea2fde3e-8b3e-4ef8-92d9-ea5dc9e51fda): Dated you and we steps under Updates / Details. Wording for the deposit return the tenant can follow.
  - [Vanta](https://mobbin.com/screens/eb1d71b4-2b3c-4a83-8435-bdc0e7cbb9e2): Deadline-driven items surface as 'Due soon' and then 'Overdue'
- **Code:** `Local DB template rows: 'Create list of all deductions from [tenant] security deposit', 'Return security deposit to [tenant]' (no due date)`, `Local DB 767 history: 'Give security deposit back to Dan' completed Oct 28 2025`
- **Verification:** partly. The finding understates the risk. Task completion dates suggest the 14-day GOL 7-108 window has been missed in most recent turns. At 647, Abbey's move-out was done Jul 28 2026 and 'Return security deposit to [abbey]...' was completed Aug 25 (about 28 days). Nico's walk-through was Aug 4 and his deductions list was done Aug 25. At 118 Congress, the rear walk-through was Oct 9 2025 and the deposit went back Nov 4 to 6. Dan's same-day return at 767 is the exception. Completion dates may lag the actual mailing, but the pattern is enough to make this high. The due offsets can ride on D28's Apply playbook (Oct 28) without waiting for the Tenancy model, by anchoring to a move-out date asked when the playbook is applied. The Vanta reference is weak support for a legal deadline.

### G2C-I01

**Keep a listing off the public site until rent, beds, baths, a photo and a date are set**

High · Design change · effort M · `Property page > Rentals card and listing editor (/properties/[id]); public /rentals` · Rentals, residents and the public site run one lifecycle

- **Today:** All three public cards on /rentals (767 Prospect 1st Front / Lower Front, 647 Prospect Rear, 933 Lafayette Floor 1) read 'No photo yet', 'Price on request' and 'Details on request'. In 767 Prospect's listing editor the status select offers Hidden, Available and Leased with no conditions, and the listing is saved as Available with empty Rent, Sqft, Beds, Baths and Available date and no photo. The save schema accepts AVAILABLE with every field blank.
- **Why:** The rentals page is what a prospective tenant sees first, and three empty cards look unfinished. They also send people to Zillow. Airbnb won't publish a listing until its required steps are done and names exactly what's missing. Zillow's listing builder ends on a review that leads with rent, beds, baths and square feet.
- **Change:** Replace the status select with a computed state. A listing is Draft until rent, beds, baths, an available date and at least one photo exist, and then shows a Publish button. While anything is missing, one card sits at the top of the listing editor: '2 things before this goes live', with links that focus each field ('Add rent', 'Add a photo'). The Rentals row shows a gray 'Draft' badge in place of 'Available'. Leased is set by Start tenancy (G2C-005), not by hand. updatePropertyListings rejects AVAILABLE when a required field is empty.
- **Desktop, tablet, phone:** Desktop 1280: the card sits above the fields as one line plus links. Tablet 768: same, full card width. Phone 375: the card shortens to '2 to go: rent, photo', the links wrap to a second line, and Publish is pinned to the bottom of the edit view.
- **Reuse:** Extend ListingsSection in src/app/(app)/properties/[id]/edit-listings.tsx; Badge (gray) from src/components/ui.tsx; add the server check to updatePropertyListings in src/app/(app)/properties/actions.ts. Builds on G2C-023 (retire 'Hidden').
- **References:** 
  - [Airbnb](https://mobbin.com/screens/2e723699-3115-4cf5-8f89-7ad3a61509df): 'Complete required steps · Finish these final tasks to publish your listing' card with a red dot, above the section cards.
  - [Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c): Listing card pill 'Action required' in a fixed corner, plus a pinned 'Confirm a few key details · Required to publish'.
  - [Zillow](https://mobbin.com/screens/8fbdae21-bbea-45ce-a44c-c564dc08de1c): Review step before publish leads with '$2,000/mo | 3 bd | 3 ba | 1240 sq ft'.
  - [Airbnb](https://mobbin.com/screens/4f8601f0-ee4b-4731-921f-d8f030659206): An 'Action required' chip on a listing card that is missing required info
  - [Airbnb](https://mobbin.com/screens/5c62c16b-2297-45d7-b8ee-288cd20794a2): Listing editor with a 'View' button to preview what guests see
  - [Airbnb](https://mobbin.com/screens/9abacc44-6bbe-4e60-8d9d-4e2d4c4c181e): In the listing editor, a 'Complete required steps' card with a red dot sits above every section. The photo tour has a rule: guests only see it once every room has a photo. Take the pinned card and the hard publish gate.
  - [Zillow](https://mobbin.com/screens/e6bd4d1f-7cb6-4cff-89ac-5fe99420e075): Owner-side listing completeness meter and 'List your property' only once complete.
  - [Airbnb](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394): Your listings pins a single card, "Confirm a few key details · Required to publish", and the setup flow won't publish until those details are in.
  - [Airbnb](https://mobbin.com/screens/9c3ff546-9537-4494-afc5-dded8925fdab): "Guests will only see your tour if every room has a photo": a requirement stated before publishing, plus a View preview button
  - [Airbnb](https://mobbin.com/screens/05e08aba-5239-4382-9ced-4954a8d4ae44): The listing editor holds publishing behind 'Your listing is ready to publish' with one Review and publish button.
  - [Shopify](https://mobbin.com/screens/d3ff22b1-e8d9-4476-b269-ec8a9d0572e6): Visibility card states 'Visible, as of July 13, 2026', making public state and its date explicit.
  - [Snowflake](https://mobbin.com/screens/55e531de-b8da-48dc-b5e2-5e9de63b7d3d): Publishing checklist beside the listing editor, with Publish disabled until required items are checked.
  - [Airbnb](https://mobbin.com/screens/6f427963-aedd-424a-955f-df4b1c15d32c): 'Complete required steps' card: a listing isn't published until photos and key details are in.
  - [Airbnb](https://mobbin.com/screens/e1d8aa60-cf3f-481a-922b-24afaed2cac9): Phone: 'Confirm a few key details · Required to publish' pinned above the tab bar.
  - [Airbnb](https://mobbin.com/screens/9201ab20-ceb1-441a-8241-2846d5c67a33): Listing setup requires photos before it can go live: 'Choose at least 5 photos'
  - [Airbnb](https://mobbin.com/screens/683e7334-9f70-413b-ae4c-661526845f4a): The photo carries the card; nothing is shown in an empty frame
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:296-302`, `src/app/(app)/properties/actions.ts:107-118`, `src/app/(marketing)/rentals/page.tsx:119`, `src/app/(marketing)/rentals/page.tsx:128`, `src/app/(marketing)/rentals/photo-carousel.tsx:16`, `src/app/(app)/properties/[id]/edit-listings.tsx:226-240`, `src/app/(app)/properties/[id]/edit-listings.tsx:296-303`, `src/app/(marketing)/rentals/page.tsx:27`, `src/app/(marketing)/rentals/page.tsx:26-33`, `src/app/(marketing)/rentals/photo-carousel.tsx:13-18`, `src/app/(app)/properties/[id]/edit-listings.tsx:300-302 (Hidden, Available, Leased options)`, `src/app/(marketing)/rentals/page.tsx:26-28 (where status in AVAILABLE, LEASED)`, `prisma/schema.prisma:286-290`, `src/app/(marketing)/rentals/photo-carousel.tsx:13-19`, `src/app/(marketing)/rentals/page.tsx:26-29`
- **Also found as:** PROPERTY-009 (Property detail page (future property hub)), PUBLIC-002 (Login and the public site), JOURNEYS-017 (Lens: the core jobs, end to end), G1E-I03 (What leaves the app: printouts, PDFs and the Google listing), PUBLIC-V06 (Login and the public site), G1D-V03 (Photos, videos and documents: viewing and capturing, not just the upload box), MOBILE-042 (Lens: phone and tablet experience on every route)
- **Verification:** confirmed. Checked live. /rentals shows three cards, each with 'No photo yet', 'Price on request' and 'Details on request' (verify-G2C/rentals--desktop-light.png). 767's editor is set to Available with Rent, Sqft, Beds, Baths and Available all empty and no photo (p767--rentals-edit--desktop-light.png). listingSchema accepts plain strings (actions.ts:107-118). 767 Prospect's status is 'Rehabbing', yet its unit is public as Available, which is exactly what the gate would catch. I spot-checked the reference pattern: Airbnb 683e7334 shows the 'Action required' pill and 'Confirm a few key details · Required to publish', and Airbnb cf0264f7 'Finish up and publish' (Complete / Required per step) is an even closer match. I didn't see the cited UUIDs themselves. Two caveats. First, Available date is required here but is never displayed anywhere today (see G2C-V01), so ship both together. Second, taking away manual Leased has to wait until Start tenancy exists, or nothing will be able to mark a unit leased.

### G2C-I06

**Compare the move-out walkthrough with the move-in report, room by room**

High · New capability · effort L · `New move-out walkthrough (phone) and its result in the unit sheet` · Rentals, residents and the public site run one lifecycle

- **Today:** A submitted move-in report becomes the plain-text description of a task titled 'Move-in inspection for {tenant} at {address}'. Each rating is a line like 'Floor: Fair (comment)', no unit is recorded because the form only asks for a property, and there's no move-out walkthrough at all.
- **Why:** Deposit deductions rest on what changed between move-in and move-out. Attio writes changes as before → after rows ('Stage → Meeting'), and 'Kitchen · Floor · Good → Poor' reads the same way. Without the comparison, deductions get argued from memory and a text blob.
- **Change:** Store each report as structured answers on the tenancy (G2C-002). Add a move-out walkthrough that uses the same rooms and items from the move-in form schema, done on a phone by Connor, Pieter or a contractor. The result lists only items that got worse, each as 'Kitchen · Floor · Good → Poor' with both comments and both photos. A running total of proposed deductions feeds the deposit statement (G2C-012).
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one row per worsened item, move-in on the left and move-out on the right. Phone 375: one row per item, the old rating small and struck above the new one, and the two photos as a swipeable pair. The walkthrough itself is phone-first.
- **Reuse:** getMoveInFormSchema (src/lib/move-in-form.ts) and the rating chips in src/app/(marketing)/residents/moving-in/move-in-form.tsx; Attachments for photos.
- **References:** 
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Change rows show the attribute, then old → new, grouped under one event.
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): Zillow ties 'Create a property condition report' to the tenancy as a next step, not as a loose form.
  - [Flighty](https://mobbin.com/screens/735a1c2a-4ed9-48c1-9ddb-b4d1ca513432): Planned and actual stacked in one cell, the planned value struck through.
  - [Turo](https://mobbin.com/screens/54258d9f-cc90-4f59-b111-d7c0cdada5d2): One damage report with 'Before damage occurred' and 'After damage occurred'
  - [Turo](https://mobbin.com/screens/0e751340-72e7-44fa-a435-ac0a8e984f50): 'Complete checkout: inspect and document condition' on the trip record
  - [Semrush](https://mobbin.com/screens/ed82aafc-c4dc-442d-87fc-359f7347f940): Original and New side by side, with changed lines highlighted
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:77-114`, `src/app/(marketing)/residents/moving-in/actions.ts:36-45`, `src/app/(marketing)/residents/moving-in/actions.ts:77-115`, `prisma/schema.prisma (no report model)`
- **Also found as:** G1B-015 (After a tenant submits: the move-in report on the staff side)
- **Verification:** confirmed. Verified in the code. actions.ts:77-114 flattens the answers into 'Label: Rating (comment)' lines in a task description, the schema has only propertyId and no unit (36-45), and no move-out walkthrough exists. New York's 2019 deposit rules (GOL 7-108) have the landlord offer a pre-move-out inspection and send an itemized statement within 14 days, which makes this a core job. Flighty 735a1c2a was confirmed real in Mobbin. This needs the tenancy record (G2C-002). G2C-V04 (ask for the unit) is the cheap first step.

### G2C-IV02

**Give a submitted move-in report a due date and an owner so it doesn't sink**

High · Fix · effort S · `Move-in report submission → property Tasks card and /tasks` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Still open at 9f74ea1: the move-in report's createTask still sets no due date or assignee, so the task still trails the dated rows in Unassigned and comes last on the property Tasks card. Setting Due to the arrival day is a one-line code change, but it is held as Connor's call. Partly addressed by the approved Today design: the report no longer sinks on the task list, but it still has no date, so it trails the dated rows and comes last on the property card. The original recommendation's default assignee conflicts with Defaults #1.
- **Today:** createTask still sets no assignee and no due date (actions.ts:107-114). On the branch this lands the report, by design (plan Defaults #1: 'Unassigned tasks (e.g. move-in form submissions)' go at the top of both partners' Mine column), in Today's Unassigned section, because groupMine counts undated unassigned tasks as due by today (list.ts:181-183). Inside that section it sorts after the dated rows and then newest first (byDateThenStatus, list.ts:133-148), so a new report would be row 6 of 35, among 29 undated Asana leftovers. The property Tasks card still sorts it last (no Target sorts last, page.tsx:86-88), and nothing else signals its arrival (D20).
- **Why:** The report is the tenant's evidence, and it can flag safety items such as 'Smoke Alarm: Poor'. The house rule 'Close the loop' needs someone to see it within days, not find it at the bottom of a 420px scroll box.
- **Change:** Keep it unassigned, as plan Default #1 decides; assigning it to Connor would overrule that. Set Due to the day it arrives. It then sorts with the dated rows at the top of Unassigned, turns red the next day, and sits among that day's rows on the property Tasks card instead of last. If G2B-I01's fold ships, dated rows stay out of the fold.
- **Desktop, tablet, phone:** No layout change at any size.
- **Reuse:** createTask in src/lib/tasks/service.ts (assigneeUserId, dueDate); todayYmd from src/lib/dates.ts; the move-in form settings page.
- **References:** 
  - [Things 3](https://mobbin.com/screens/3b3a210d-25a0-4603-abba-66c9995c867e): The deadline row reads 'Thu, Mar 30 · 14 days left' with a flag. Use it for 'Review by Oct 22'.
  - [Things 3](https://mobbin.com/screens/e90634cd-7e0b-4852-9fc6-f57a017276b6): The flag reads '4d left' in gray and turns into a red 'today' on the day, so an ignored report becomes visible without an alert.
  - [Airwallex](https://mobbin.com/flows/9afbce42-5ab9-4c7a-a574-2b6b83cde1fd): Requests sit in a 'Pending your approval' queue until acted on
- **Code:** `src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `src/app/(app)/properties/[id]/page.tsx:28`, `src/app/(app)/tasks/page.tsx:101`, `src/lib/tasks/service.ts:56-70`, `branch src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `branch src/lib/tasks/list.ts:133-148, 176-193`, `branch src/app/(app)/properties/[id]/page.tsx:86-88`, `asana-migration-plan.md, Defaults I filled in, #1 (line 96)`, `src/app/(marketing)/residents/moving-in/actions.ts:108-114`, `branch: src/app/(marketing)/residents/moving-in/actions.ts:107-114`, `branch: src/lib/tasks/list.ts:176-189`
- **Also found as:** G1B-020 (After a tenant submits: the move-in report on the staff side)
- **Verification:** verifier-found

### G2C-V01

**Show each card's Edit link on touch tablets, not only below 640px**

High · Fix · effort S · `Property page cards at tablet (Rentals, Units & access, Details, Loan, Insurance, Building CapEx, Notes)` · The phone is a chosen subset, and touch has no hover · quick win

- **Today:** At 768 with touch, all 7 card Edit buttons on 647 Prospect have computed opacity 0 in WebKit, where (hover: none) is true. They appear only on hover or below 640px, because the class is 'opacity-0 group-hover:opacity-100 max-sm:opacity-100'. The tablet screenshot shows Units & access, Rentals and Details headers with no Edit at all, but the invisible buttons still take taps.
- **Why:** On an iPad at the unit there's no visible way to update a listing, a unit or its lockbox code. The house rules give tablets the touch layout, and the trigger here is screen width when it should be input type.
- **Change:** Replace 'max-sm:opacity-100' with 'pointer-coarse:opacity-100' (Tailwind 4.3 variant). That's the same (pointer: coarse) query globals.css already uses for 16px fields. Every touch device then shows the card's single Edit link, and mouse users keep the hover reveal. It's one Edit per card, not a pencil per field, so it stays within the touch rule.
- **Desktop, tablet, phone:** 1280 with a mouse: unchanged hover reveal. 768 touch: Edit visible in every card header. 375: unchanged, since it's already visible. A touchscreen laptop with a mouse as its primary pointer keeps hover.
- **Reuse:** The card header in src/components/ui.tsx:51 plus the three inline copies at edit-listings.tsx:118, edit-units.tsx:93 and building-capex.tsx:143. Consolidate them onto the ui.tsx header while there.
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): A persistent small pencil button in the Details and Metadata headers, never hover-only
  - [Airbnb](https://mobbin.com/screens/e9da847d-3b16-4b23-a21c-d750ea9dbf06): On phone each summary row (Guests, Total price) carries a visible small gray 'Change' or 'Details' button; nothing depends on hover.
  - [Mercury](https://mobbin.com/screens/f02d23c4-f6ae-4eaa-8a09-c01b098cb7a1): Every editable value has a small 'Edit ›' link under it that is always visible, with no hover dependence, and works the same on touch.
  - [WhatsApp](https://mobbin.com/screens/56113f98-413d-4ea4-b3e8-1aedb33075bc): Profile fields show their edit and copy affordances persistently rather than on hover.
- **Code:** `WebKit tablet eval on /properties/cmtg25y4m0003jphsrpe7xpb8: Edit button opacities [0,0,0,0,0,0,0], matchMedia('(hover: none)') true`, `src/components/ui.tsx:51`, `src/app/(app)/properties/[id]/edit-listings.tsx:118`, `src/app/(app)/properties/[id]/edit-units.tsx:93`, `src/app/(app)/properties/[id]/building-capex.tsx:143`, `src/app/globals.css:54 (existing pointer: coarse rule)`, `src/components/ui.tsx:48-55`, `src/app/(app)/properties/[id]/building-capex.tsx:141-146`, `src/app/(app)/properties/[id]/edit-units.tsx:91-96`, `src/app/(app)/properties/[id]/edit-listings.tsx:116-121`, `probe at 768 WebKit: Edit opacities '0,0,0,0,0,0,0'; at 375 '1,1,1,1,1,1,1'`, `prop767-touch run: Edit opacity = 0,0,0,0,0,0,0 at tablet and 1,1,1,1,1,1,1 at mobile`, `src/app/(app)/properties/[id]/edit-listings.tsx:118,481,485`
- **Also found as:** PROPERTY-004 (Property detail page (future property hub)), VISUAL-003 (Lens: visual design system across every screen), MOBILE-018 (Lens: phone and tablet experience on every route), FEEL-011 (Lens: interaction quality, feedback, states, speed and accessibility), JOURNEYS-012 (Lens: the core jobs, end to end), G1D-V02 (Photos, videos and documents: viewing and capturing, not just the upload box)
- **Verification:** verifier-found

### G2C-006

**'Remove listing' deletes its photos from storage on Save, with no confirm or undo**

Medium · Fix · effort S · `Property page, Rentals editor` · Every save is safe, instant and undoable

- **Today:** In edit mode, the red 'Remove listing' text link (edit-listings.tsx:308) drops the listing from state. On Save, replaceListings deletes the row and calls del() on every photo URL (service.ts:287-295, 316-322). There's no confirm, and Discard only helps before Save. After a unit is leased, removing the old listing is the natural tidy-up, and it throws away the photos needed for the next turn.
- **Why:** Photos are the costliest part of a listing to redo: a trip to a cleaned, staged unit. PROPERTY-001 and G1D-V01 already treat one-tap permanent deletes as high risk. This one sits behind a Save, so it reads as safe when it isn't.
- **Change:** Until G2C-007 lands, confirm on Remove ('Remove the Rear listing and its 6 photos?') and keep removed listings' photos for 30 days instead of deleting the blobs during the save. After G2C-007, a unit's listing has no Remove, only 'Take down'.
- **Desktop, tablet, phone:** Centered confirm at 1280 and 768; bottom action sheet at 375 (MOBILE-027).
- **Reuse:** ConfirmDialog; src/lib/properties/service.ts replaceListings.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): 'Notification snoozed · Undo' toast. Removing a listing should behave the same and keep photos until the toast expires.
  - [Mercury](https://mobbin.com/screens/a7527a49-217f-426a-8169-cfbf5c00ab52): 'Payments canceled' toast names the exact change in place of a confirm dialog.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:296-309`, `src/lib/properties/service.ts:282-322`
- **Verification:** confirmed. Reproduced. In edit mode, 'Remove listing' dropped the card with no confirm, and Save posted at once (blockedWrites shows the POST). replaceListings then deletes the row and del()s every photo blob after commit (service.ts:282-322). The exposure is zero today because no listing has photos, which keeps it at medium. Turo's Listing status screen (https://mobbin.com/screens/68cd7399-0982-4845-9b2a-e25e0430c38b) is a good anchor: Listed, Snoozed, Unlisted, and a separate red 'Delete listing' with its consequence spelled out. That matches the 'Take down' end state.

### G2C-007

**Keep one listing per unit, reused each turn and prefilled from the unit**

Medium · Design change · effort M · `Property hub: the unit's listing (unit sheet)` · Rentals, residents and the public site run one lifecycle

- **Today:** Listings are free-standing rows matched to a unit label. '+ Add listing' creates a second listing for '1st Front / Lower Front' while the first still exists; the select offers every unit. Beds, baths and sqft live on the listing, so each new one starts blank, and all three live listings say 'No details yet'. Status is Hidden (amber), Available or Leased, all set by hand.
- **Why:** A unit is relisted every one to three years with the same beds, baths and sqft and mostly the same photos. Turo and Airbnb keep one listing per car or home and switch it between Listed, Snoozed and Incomplete. Nobody re-creates the thing to rent it again.
- **Change:** Move beds, baths and sqft onto the unit. Give each rentable unit exactly one listing, created on first use, with two states you set: Draft and Live. 'Leased' stops being a listing status; it's the unit's tenancy. Record notice (G2C-004) puts the listing in Draft with the available date and last rent filled in. Start tenancy (G2C-005) takes it down. Remove '+ Add listing' and the unit select. Going Live still requires rent and a photo (JOURNEYS-017).
- **Desktop, tablet, phone:** 1280 and 768: a Listing section in the unit sheet with the photo strip, asking rent, available date and a Draft | Live segmented control. 375: the same section, photos in a two-column grid.
- **Reuse:** PROPERTY-040's listing editor, the segmented control in deals/filters.tsx, and the ListingPhoto table unchanged.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/2e723699-3115-4cf5-8f89-7ad3a61509df): The listing editor is one persistent record of section cards that summarize their content ('Check-in 3:00 PM to 5:00 PM', 'Directions · Add details'). The listing outlives each booking, as HG's should outlive each tenant.
  - [Zillow](https://mobbin.com/screens/8fbdae21-bbea-45ce-a44c-c564dc08de1c): Review step leads with '$2,000/mo | 3 bd | 3 ba | 1240 sq ft' pulled from saved facts. That's the prefill-from-unit summary.
  - [Turo](https://mobbin.com/screens/ef84529b-4cb3-43c0-add4-edb30f96cd6a): One 'LISTED' row on the car says what the public state means; tap to change
  - [Turo](https://mobbin.com/screens/69f93658-54ac-4cb3-9b57-a6b9a57037e0): The same vehicle card carries a 'Snoozed' state instead of being removed
  - [Airbnb](https://mobbin.com/screens/000e7f72-db2e-404c-a79f-2346678ccf4b): 'Complete required steps' gates publishing on one persistent listing
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:25-34`, `src/app/(app)/properties/[id]/edit-listings.tsx:128-136`, `src/app/(app)/properties/[id]/edit-listings.tsx:276`
- **Verification:** confirmed. Confirmed: the unit select offers every unit, including one that already has a listing (eval: 'Select unit…/Upper / Upper Front/1st Front / Lower Front/1st Rear / Apt #3'). New listings default to Hidden, and beds, baths and sqft live on the listing (all three show 'No details yet'). Turo ef84529b is real (a 'LISTED' row on the car explaining the public state). This removes a button and a select, which suits the simplicity bar. Moving specs onto the unit depends on G2C-002's Unit table.

### G2C-008

**Stop listing units twice: show the listing as the vacant unit's state**

Medium · Design change · effort S · `Property page: Units & access and Rentals (D10 Units tab)` · Rentals, residents and the public site run one lifecycle

- **Today:** Units & access and Rentals are two cards that each list units with different chrome. '1st Front / Lower Front' appears as an accordion header in one and as a bordered row with a green Available badge in the other. Rentals is empty for most units, and its editor refuses to start until a unit exists 'in Units & access above first'.
- **Why:** Two lists for one set of units doubles the reading and lets them drift apart; listing labels already disagree with task names. Zillow keeps the listing as a facet of the property, not as a second inventory.
- **Change:** Drop the Rentals section from the D10 Units tab. A listed unit's Next cell reads 'Listed $1,200 · View live'. A draft reads 'Listing draft · needs photos'. Listing editing moves into the unit sheet (G2C-007). The hub has no separate Rentals heading.
- **Desktop, tablet, phone:** The same at every width. At 375 the listing state is the second line of the unit row.
- **Reuse:** The Units table (G2C-003) and PROPERTY-011's tab map.
- **References:** 
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): The property header carries one OFF-MARKET pill and Listing is a tab of the same record, not a second list of the same units.
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): Listing is one card on the property overview, beside the tenants
  - [Realtor.com](https://mobbin.com/screens/c5350956-6723-43bd-9718-e001540cc6fd): 'For rent' shown as a status dot with the price, not as a separate list
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:158-160`, `src/app/(app)/properties/[id]/page.tsx:107-119`
- **Verification:** confirmed. Seen at 1280 and 320: the same unit is listed in two cards with different chrome. D10's tab list (Overview, Tasks, Units, Documents, Financials, CapEx, Activity) has no Rentals tab, so folding the listing into the Units row fits the settled layout. Small wording fix: the editor opens fine; it's only '+ Add listing' that's disabled until a unit exists.

### G2C-009

**Build the unit sheet around the tenancy: status chips, one action, then history**

Medium · Design change · effort M · `Property hub: unit sheet (opened from a Units row)` · Rentals, residents and the public site run one lifecycle

- **Today:** A unit's facts are split between Units & access (lockbox, utilities, equipment), Rentals (listing), Tasks (turn work, rent notes) and Drive or Baselane (the lease). There's no unit view. PROPERTY-018 proposes a unit sheet without saying what goes in it.
- **Why:** The sheet is where a partner lands from Home ('Front lease ends in 58 days'), so it has to lead with state and the one thing to do. Stripe's customer page puts the subscription row first, then payments and a details rail; Linear Mobile puts a chip row under the title.
- **Change:** Header: 'Front · 767 Prospect', with a chip row for status and date, '2 bd · 1 ba · 850 sqft', and 'Lockbox' (tap to reveal). One primary action by state: Occupied gets 'Record notice' (with 'Renew' secondary), Notice gets 'Open listing draft', Vacant gets 'Start tenancy'. Sections in order: Tenancy (current names, dates, rent and 'Open in Baselane'; past tenancies as one-line rows such as 'Aug 2025 to Oct 2025 · $1,100'), Listing (G2C-007), Turn (the playbook run's progress, 'Move out · 3 of 6', G1C-023), Move-in report ('On file Nov 3' or 'Missing', G1B-013), Access and utilities, Equipment. Empty sections fold away.
- **Desktop, tablet, phone:** 1280: a 480px right sheet over the Units table. 768: a sheet at 60% width. 375: a full-screen page with the primary action in a sticky bottom bar. Chips wrap to two lines at most, and Equipment starts collapsed.
- **Reuse:** React Aria sheet (approved), Badge, and label-left fact rows (PROPERTY-015).
- **References:** 
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Activity groups changes as before → after rows ('Stage → Meeting') beside a Details rail. Use it for tenancy history: 'Rent $1,100 → $1,200 · Dec 1'.
  - [Resend](https://mobbin.com/screens/046759e2-bf3e-4fd5-899f-a115278d5f8c): Icon tile, eyebrow and title, a strip of uppercase facts, then a horizontal events strip with dates. The unit sheet header in miniature.
  - [Jobber](https://mobbin.com/screens/fd3c5053-9fe6-42f0-9ea5-a5e1e1ef2df3): Status chip above the title and the next lifecycle step as the primary buttons. Matches 'status chips, one action'.
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): Record page: subscription row with dated status first, history below, details rail
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): Phone detail: a chip row under the title carries status, project and date
  - [Unity](https://mobbin.com/screens/90b2a1ca-8f1a-433f-b5d1-3cb2f0a829cb): A period range on one row ('Mar 28, 2025 - Apr 27, 2025') next to the Active status
- **Verification:** confirmed. No unit view exists today. The section order is sound, and 'Empty sections fold away' keeps it from bloating. Keep the chip row to status and date only: beds and baths already sit in the Units table, and a lockbox chip duplicates the Access section.

### G2C-010

**Give Home three kinds of unit row: lease ending, on notice and vacant**

Medium · Design change · effort S · `Home (/), Needs you list` · Home and Today become one work queue

- **Today:** Home shows three counts (13 active deals, 11 properties, 193 open tasks), the CapEx forecast and My open tasks. It says nothing about units: no lease ending, no notice, no vacancy. Lease ends live in task titles like 'List units (for 16mon lease ending in summer)'.
- **Why:** A vacant unit is the most expensive thing in a small portfolio, and a missed lease end is a missed legal notice (G2C-011). SHELL-003 rebuilds Home as one Needs you list, and these are the unit rows it needs. Vanta's Needs attention groups Overdue and Due soon; Contractbook flags an expiry 'In 8 days'.
- **Change:** Inside SHELL-003's list, add one-line rows that appear only when someone has to act: 'Front, 767 Prospect · lease ends in 58 days · decide by Dec 1' (Renew or Record notice), 'Rear, 647 Prospect · vacant 23 days · listing has no photos', and 'Front, 767 Prospect · moves out Nov 30 · 4 of 6 steps done'. No new card and no counts strip. Each row opens the unit sheet.
- **Desktop, tablet, phone:** 1280 and 768: one line with a trailing chevron; actions show on hover with a mouse and live in the sheet on touch. 375: two lines, unit and property first, then the reason; a tap opens the sheet.
- **Reuse:** SHELL-003's list and Home's task-row styling.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/a712767b-113c-4ead-875d-40a5fa2f9830): Today / Upcoming switch with person-first event cards ('Sandra's group of 3 checks in' at 3:00 PM). Wording model for unit rows on Home.
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): One pinned blocker card above Today / Upcoming and a one-sentence empty state.
  - [Mercury](https://mobbin.com/screens/d989795f-1f53-4ea4-9f9e-bf05ab5fa6ca): Total outstanding, Overdue, Due in next 7 days tiles with count and money. The three unit-row kinds can summarize the same way.
  - [Vanta](https://mobbin.com/screens/eb1d71b4-2b3c-4a83-8435-bdc0e7cbb9e2): Needs attention split into Overdue and Due soon, each one line
  - [Contractbook](https://mobbin.com/screens/d15b790e-f837-4fa6-b346-de38b82609f4): Expiry shown as 'In 8 days' only when it's close; a plain date otherwise
- **Code:** `src/app/(app)/page.tsx:31-40`, `Local DB task at 767 Prospect: 'List units (for 16mon lease ending in summer)'`
- **Verification:** confirmed. Home aria confirms three counts, the CapEx forecast and tasks, and no unit rows. It adds rows to SHELL-003's list rather than a new card, which is the right restraint. It depends on G2C-002.

### G2C-011

**Time lease-end reminders to New York's 30, 60 and 90 day notice rule**

Medium · New capability · effort S · `Home rows and the unit sheet (lease ending)` · Rentals, residents and the public site run one lifecycle

- **Today:** No lease end dates exist, so nothing warns before a deadline. Rent increases are tracked as loose tasks at 767 Prospect: 'Send notice to BMHA for new rent increase for Maritza' and 'check when Maritza's rent is increased (requested July 21 2026)'.
- **Why:** Under New York Real Property Law 226-c, a landlord who won't renew, or who will raise rent by 5% or more, must give written notice 30 days ahead for tenancies under a year, 60 days for one to two years, and 90 days for two years or more. A flat '60 days before' reminder is wrong in two of the three cases. Confirm the rule with the attorney before the copy ships.
- **Change:** Compute a 'decide by' date for each tenancy from its length: the end date minus 30, 60 or 90 days. Show the Home row two weeks before that date: 'Front · decide on renewal by Dec 1'. Show the same date in the unit's Lease ends cell inside the window. A rent change of 5% or more (G2C-016) gets the same notice date. Month-to-month tenancies get a row only when a notice or rent change is recorded.
- **Desktop, tablet, phone:** Text only. At 375 the '· decide by Dec 1' part drops from the Units row but stays on the Home row.
- **Reuse:** Tenancy dates (G2C-002) and Home rows (G2C-010).
- **References:** 
  - [Mercury](https://mobbin.com/screens/24ad0e7d-5ac7-4938-aede-9ee54f94f676): A due date with a relative sublabel ('Nov 1 · in 3 days'). Use it for 'Lease ends Jan 31 · decide by Dec 1'.
  - [Mercury](https://mobbin.com/screens/d989795f-1f53-4ea4-9f9e-bf05ab5fa6ca): A fixed window tile ('Due in next 7 days'). Reminder windows at 90, 60 and 30 days can read the same way.
  - [Contractbook](https://mobbin.com/screens/d15b790e-f837-4fa6-b346-de38b82609f4): Relative expiry ('In 8 days', 'In 3 months') tinted only when it's near
  - [GoDaddy](https://mobbin.com/screens/53f1d04f-8411-4dcf-8c7c-cc69a4aebe1e): 'Cancels 12/09/2025' in red beside 'Auto Renews' rows: the ending date is the signal
- **Code:** `Local DB tasks at 767 Prospect: 'Send notice to BMHA for new rent increase for Maritza' (done Jul 28), 'check when Maritza's rent is increased' (open)`
- **Verification:** confirmed. The RPL 226-c tiers are stated correctly: 30, 60 or 90 days by occupancy or lease length, triggered by non-renewal or an increase of 5% or more. The attorney caveat is appropriate. The task evidence ('Send notice to BMHA for new rent increase for Maritza', done Jul 28) is real. The references are loose analogies but acceptable.

### G2C-013

**Drive Portfolio's Units cell and rent from tenancies, not listings**

Medium · Design change · effort S · `/properties, Units column` · Rentals, residents and the public site run one lifecycle

- **Today:** Portfolio's Units column shows unitCount (4 for 767 Prospect, against 3 units on its page) with nothing about occupancy. Deriving vacancy from listings would miss vacant units that aren't listed yet. The current listings themselves match vacant units.
- **Why:** Listings lag reality in both directions: a unit can be vacant and unlisted while it's being painted, or listed while the tenant is still there on notice. Vacancy derived from listings would be wrong both ways. Stripe's counts come from the records, not from the marketing state.
- **Change:** Units cell: '3' when full, '3 · 1 vacant' when not, with the second part muted and no badge, computed from tenancies. Add Rent, right-aligned: the sum of current tenancy rents, shown as '$2,200 of $3,400' when a unit is vacant (a vacant unit counts its last or asking rent). This replaces PORTFOLIO-028's listing source and PORTFOLIO-027's QuickBooks source for the scheduled figure.
- **Desktop, tablet, phone:** 1280: two columns. 768: the Units cell keeps '3 · 1 vacant' and Rent moves to the row's second line. 375 (PORTFOLIO-004 rows): '3 units · 1 vacant · $2,200/mo' as the subline.
- **Reuse:** Table and Td, PORTFOLIO-004's phone rows and PORTFOLIO-012's alignment.
- **References:** 
  - [Zillow](https://mobbin.com/screens/c84e5a02-a339-4398-aca6-62e505305f35): Properties list carries rent and lease state per row, from tenancy records
  - [Stripe](https://mobbin.com/screens/bc21762d-28b7-487c-b34e-7973e5e7e4b9): Status counts come from the records (Active, Scheduled, Cancelled)
- **Code:** `src/app/(app)/properties/page.tsx:24`, `src/app/(app)/properties/page.tsx:81`
- **Verification:** partly. The Units cell is unitCount (properties/page.tsx:81), confirmed in verify-G2C/portfolio--desktop-light.png. The case against listing-derived vacancy is sound in principle, but the cited contradiction isn't one: a listed vacant unit with an open 'find a tenant' task is consistent. The better argument is that a unit being painted is vacant but unlisted. Adding a Rent column is reasonable.

### G2C-014

**Add a Units view to Portfolio that is the real rent roll, with an export for lenders**

Medium · New capability · effort M · `/properties, a new Units view` · Rentals, residents and the public site run one lifecycle

- **Today:** There's no list of all 31 units. Financials' 'Rent roll' tab is rent received per property per month (DATA-057). Lenders ask for leases unit by unit: one 767 Prospect task reads 'FOR VONTIVE ... please provide the lease agreements for the 2 tenant occupied units in the Triplex'.
- **Why:** Lenders, insurers and appraisers ask for a rent roll (unit, tenant, rent, lease start and end, status) at every refi. With tenancies it's a query, not a spreadsheet. Stripe's Subscriptions list, with status filter cards and dated status pills, is the right shape.
- **Change:** Add a Properties | Units segmented control on /properties. The Units view has Property, Unit, Status, Tenant, Rent and Lease ends columns, sortable by Lease ends, with an Occupied / Notice / Vacant filter showing counts. Put 'Export rent roll' (CSV and PDF, one property or all) in the header. Financials' tab keeps rent collected, under that name.
- **Desktop, tablet, phone:** 1280: the full table. 768: Property and Unit merge ('767 Prospect · Front') and Tenant drops. 375: two-line rows sorted by lease end, with Export in the header menu.
- **Reuse:** The segmented control in deals/filters.tsx, Table, SortHeader, and PORTFOLIO-030's export plumbing.
- **References:** 
  - [Stripe](https://mobbin.com/screens/bc21762d-28b7-487c-b34e-7973e5e7e4b9): Status filter cards over one table of records, each with a dated status and Export
  - [Zillow](https://mobbin.com/screens/c84e5a02-a339-4398-aca6-62e505305f35): Portfolio rows with rent and lease state in columns
- **Code:** `Local DB task at 767 Prospect: 'FOR VONTIVE - ... please provide the lease agreements for the 2 tenant occupied units in the Triplex'`
- **Verification:** confirmed. The Vontive task asking for the leases on the two occupied Triplex units is in the DB. Financials' 'Rent roll' tab is really rent received, which misuses the lender's term, and the rename to 'Rent collected' is the cheapest part of this. Stripe's status filter cards are real (similar Stripe subscription screens returned, e.g. https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6).

### G2C-015

**Compare expected with collected rent per property, not per unit**

Medium · Design change · effort M · `/financials/rent-roll (Rent collected)` · The QuickBooks mirror is honest about what it covers

- **Today:** Rent is summed by QuickBooks class per property (queries.ts:273-300). Classes exist per property, never per unit, and the page has no expected figure. FINANCIALS-007 proposes scheduled rent per unit.
- **Why:** Collected rent per unit would need unit-level QuickBooks classes or a Baselane feed, and neither exists. Reconcile where both sides do exist, at the property and month; that's how Stripe's invoice aging works, on the level the books keep.
- **Change:** Each property row shows Expected (the sum of tenancy rents active that month, prorated for move-in and move-out days) against Collected (QuickBooks), plus the gap. The gap turns red only when collected falls short by more than $50. Expanding a property lists its units' expected rents, with no per-unit collected column. Units with no rent recorded show a dash, and the property says 'Expected covers 2 of 3 units'.
- **Desktop, tablet, phone:** 1280: Expected, Collected and Gap per month. 768: the current month only, with a month stepper (FINANCIALS-030). 375: property rows reading 'Expected $3,400 · Collected $2,200'.
- **Reuse:** getRentRoll, fmtCents and Kpi; builds on FINANCIALS-007 and FINANCIALS-006.
- **References:** 
  - [Copilot](https://mobbin.com/screens/b4297200-6207-407b-a4b6-53ce337d9c5e): '$135 left to pay / $125 paid so far' with a ring, then dated rows with a check when paid. Expected vs collected rent per property follows this exactly.
  - [Stripe](https://mobbin.com/screens/843bbb26-afef-41a8-9e91-697a77fa63fc): Outstanding money summarized in plain bands at the level the ledger keeps
- **Code:** `src/lib/quickbooks/queries.ts:273-300`, `src/app/(app)/financials/rent-roll/page.tsx:29-33`
- **Verification:** confirmed. Code confirms rent is summed per property from QuickBooks classes (queries.ts:273-300). Locally the page renders only a 'Portfolio $0' row because the dev DB has no rent ledger lines, so the screenshot evidence shows nothing. The claim rests on code. Keeping the comparison at property level is right. Consider dropping the proration and flagging move-in and move-out months instead, which is simpler and good enough for a two-partner check. The Stripe 'invoice aging' analogy is weak.

### G2C-016

**Record a rent change with the date it takes effect**

Medium · New capability · effort S · `Unit sheet, Tenancy section` · Rentals, residents and the public site run one lifecycle

- **Today:** 767 Prospect tracks one tenant's increase through four tasks: 'Send notice to BMHA for new rent increase' (done Jul 28), 'check when Maritza's rent is increased (requested July 21 2026)' (open since Sep 24), 'update maritza rent' (due Nov 11) and 'what are all the changes we made to maritza's unit?'.
- **Why:** A rent change is a dated fact, not a to-do list. Stripe models it as a scheduled change on the subscription: the current price keeps showing until the date. PlayAI's billing card shows 'Renews on' beside a scheduled change the same way.
- **Change:** Add 'Change rent' on the tenancy, with a new amount and an effective date. Before the date, the Rent cell reads '$1,050, $1,120 from Dec 1'. After it, the history keeps both amounts. Expected rent (G2C-015) switches on that date. A change of 5% or more gets G2C-011's notice date.
- **Desktop, tablet, phone:** The same text at every width. At 375 the pending change is the row's second line.
- **Reuse:** The Tenancy record and a toast.
- **References:** 
  - [Copilot](https://mobbin.com/screens/b8ee0b14-088d-407e-88ee-627b31d1bd7e): Recurring amount as a sentence with 'Expected around Sep 3rd' and a dashed future point on the history line. Rent with its effective date fits this shape.
  - [Attio](https://mobbin.com/screens/297adfeb-8312-496b-8acf-41839a6cf775): Change rows show old → new with when and who; the rent change history line.
  - [Stripe](https://mobbin.com/screens/bc21762d-28b7-487c-b34e-7973e5e7e4b9): A 'Scheduled' state alongside Active: changes queued against a date
  - [PlayAI](https://mobbin.com/screens/dafb1e3d-ad9c-4907-af23-77a22e82765e): Started on, Renews on and a scheduled change spelled out on one card
- **Code:** `Local DB: 'Send notice to BMHA for new rent increase for Maritza' completed Jul 28 2026`
- **Verification:** confirmed. All four Maritza tasks exist. Small correction: 'check when Maritza's rent is increased' was created Aug 12 and has been overdue since its Sep 24 due date. 'Open since Sep 24' is loose wording.

### G2C-017

**Keep money and documents in Baselane; store only who, when and how much**

Medium · Design change · effort S · `Unit sheet, Tenancy section (and the OS's scope)` · Rentals, residents and the public site run one lifecycle

- **Today:** Baselane holds rent collection (the move-in page says 'Rent is paid through Baselane'), deposits ('Transfer [Tenant] security deposit to Baselane') and leases ('Upload signed [Tenant] lease to Baselane'). NEW TENANT also says 'Store [Tenant] signed lease', a second copy, and 15 Oxford has 'Store all of lower tenant information in GDrive'. property-page-plan §2 proposes depositHeld and marketRent on the unit.
- **Why:** Copying a ledger, deposit balances or lease files into the OS creates a second source of truth that two partners would have to keep in sync, which is the opposite of simple. Stripe and Ramp link to the system that owns the money rather than mirroring it.
- **Change:** Per tenancy, the OS stores names, an optional phone, start, end, notice date and rent (plus the voucher share, G2C-030) and a Baselane link. It doesn't copy payment status or balances, late fees, deposit amounts or returns, lease PDFs, applications or screening, or tenant messages. 'Open in Baselane' sits on the tenancy line. Drop 'Store signed lease' from NEW TENANT (G2C-021), and drop depositHeld from the plan.
- **Desktop, tablet, phone:** 1280 and 768: a trailing text link on the tenancy line. 375: its own row in the Tenancy section.
- **Reuse:** The Tenancy record (G2C-002).
- **References:** 
  - [Stripe](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786): The record shows state and links out; the details rail stays short
  - [Zillow](https://mobbin.com/screens/e093ec63-ccd7-4ed3-8259-851145ca9487): Lease signing state lives with the lease tool; the property only shows its status
- **Code:** `docs/property-page-plan.md:73-80`, `Local DB NEW TENANT rows: 'Store [Tenant] signed lease' and 'Upload signed [Tenant] lease to Baselane'`
- **Verification:** confirmed. Confirmed: NEW TENANT stores the lease twice, and property-page-plan §2 (lines 73-80) proposes depositHeld and marketRent. This is the right simplicity call. It should say openly that the Tenancy still copies names, dates and rent from Baselane: that's the one accepted duplicate, kept because those fields drive dates and alerts.

### G2C-018

**Mark house-meter rows as common, not rentable units**

Medium · Fix · effort S · `Units at 15 Oxford and 415 Crescent; Portfolio Units` · Rentals, residents and the public site run one lifecycle

- **Today:** 15 Oxford lists Lower, Upper, Attic and 'HSE (house)'. 415 Crescent lists Unit 1 to Unit 6 and 'HSE (house)'. The HSE rows hold house-meter utilities, not apartments. The property page counts them (4 and 7 units) while Portfolio says 3 and 6, which is part of PORTFOLIO-001's mismatch.
- **Why:** Once occupancy exists, a house-meter row would show as a permanently vacant unit and drag down vacancy and expected rent. The fix is a flag, not a rename.
- **Change:** Add 'Rentable' to the unit, on by default. Turn it off for the two HSE rows and show them last in the Units table as 'Common (house meter)', with no status or rent. Unit counts, vacancy and expected rent count rentable units only. unitCount can then be derived and dropped.
- **Desktop, tablet, phone:** The common row sits last at every width: one muted line.
- **Reuse:** The Unit model; PORTFOLIO-001's fix.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:75`, `src/app/(app)/properties/page.tsx:81`, `Local DB: 15 Oxford units 'Lower | Upper | Attic | HSE (house)' with unitCount 3; 415 Crescent 7 rows with unitCount 6`
- **Verification:** confirmed. DB confirms the 15 Oxford units are Lower, Upper, Attic and HSE (house) with unitCount 3, and 415 Crescent has 7 rows with unitCount 6. Portfolio shows 3 and 6 while the property pages count 4 and 7.

### G2C-025

**Seed occupancy with a 'Who lives here?' pass across the 29 rentable units**

Medium · New capability · effort S · `Property hub Units tab, first use` · Rentals, residents and the public site run one lifecycle

- **Today:** Today occupancy exists only in the partners' heads, in Baselane and in task titles. G2C-002 would ship with no tenancy on any of the 29 rentable units.
- **Why:** A model with no data drives nothing: Home, Portfolio and the rent comparison would all read as vacant. Airbnb and Turo mark an incomplete record in place and let you finish it there.
- **Change:** Until a rentable unit has a tenancy or is marked vacant, its Status cell reads 'Who lives here?' as a tap target that opens Start tenancy with an 'Already living here' option (start date optional). Portfolio's Units cell reads '3 · 2 not set' until it's done. Expected rent and vacancy leave out units that aren't set, and say so. That's about 29 rows of four inputs: one sitting with Baselane open.
- **Desktop, tablet, phone:** The same at every width. At 375 the prompt is the row's second line.
- **Reuse:** The Start tenancy sheet (G2C-005).
- **References:** 
  - [Airbnb](https://mobbin.com/screens/fc6b314f-c9b0-4ce8-bdc2-a68c51017c08): A single 'Confirm important details · Required to publish · Start' card heads Today. The 'Who lives here?' pass can be one card like this with a count.
  - [Zillow](https://mobbin.com/screens/411a014d-6c93-4783-95f3-a17fa583a207): Lease builder marks each section 'Incomplete' with a small warning badge and lets you fill it in place.
  - [Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c): 'Action required' marked on the listing card itself, finished in place
  - [Turo](https://mobbin.com/screens/e4be0e08-48b6-4880-8cf5-ce2807cce037): An 'INCOMPLETE' row with a red dot on the record until required info is in
- **Code:** `src/lib/property-types.ts:19-24`, `Local DB Property.units: no occupancy, tenant or rent fields on any of 31 rows`
- **Verification:** confirmed. The count is right: 31 unit rows minus the 2 HSE rows leaves 29. G2C-002 does nothing until this is done. Check first whether Baselane can export its lease list. A one-time CSV import would beat 29 manual entries, with the in-place 'Who lives here?' prompt as the fallback for gaps.

### G2C-026

**Add 'Renew' on a tenancy whose lease is ending**

Medium · New capability · effort S · `Unit sheet and Home's lease-ending row` · Rentals, residents and the public site run one lifecycle

- **Today:** Renewals happen through loose tasks: 'Ask group of 4 tenants if they want 1yr, 2yr, or 3yr lease' and 'Message tenant about staying and paying same rent' (647 Prospect). The terms they agree to are recorded nowhere.
- **Why:** Most lease ends become renewals, not turns. Without a renewal action, the lease-end row in G2C-010 can only offer a move-out.
- **Change:** Put 'Renew' on the unit sheet and on Home's lease-ending row. It asks for a new end date (quick picks '+1 year', '+2 years', 'Month to month') and an optional new rent with its effective date (G2C-016). It extends the tenancy and adds a history line: 'Renewed Nov 2 · to Jun 30, 2028 · $1,120'.
- **Desktop, tablet, phone:** Same sheet pattern as G2C-004 at each width.
- **Reuse:** The Tenancy record, the rent change from G2C-016, and quick picks from MOBILE-035.
- **References:** 
  - [Zillow](https://mobbin.com/screens/eede5efb-f0e2-40bb-8cab-0b1808f77f72): Lease card: tenant, date range, status chips and one primary verb ('Sign lease'). Renew sits in the same slot.
  - [Zillow](https://mobbin.com/screens/e093ec63-ccd7-4ed3-8259-851145ca9487): 'Lease becomes active on May 30, 2026' under a SIGNING COMPLETED chip; the renewed tenancy's start reads the same.
  - [PlayAI](https://mobbin.com/screens/dafb1e3d-ad9c-4907-af23-77a22e82765e): 'Started on' and 'Renews on' dates on one card; the renewal is a date change, not a new record
- **Verification:** confirmed. Both 647 tasks are in the DB ('Ask group of 4 tenants...', 'Message tenant about staying and paying same rent'), along with '647 Prospect Finalize Lease Extension'. Without Renew, G2C-010's lease-end row can only offer a move-out.

### G2C-027

**Mark jobs in occupied units and prompt the 24-hour notice to the tenant**

Medium · New capability · effort S · `Staff task rail and the contractor job page, for jobs in occupied units` · Contractor jobs and media close the loop

- **Migration branch:** Still applies on the migration branch. Nothing marks an occupied unit. The Scheduled status with a visit date exists (D6c), and the contractor job page (/p/jobs/cmvkik0ht0003jpg7nflnvoun) shows status, Target, address with unit, Lockbox, Notes, Checklist and Updates. There's no occupancy line and no tenant prompt in the staff rail.
- **Today:** Notice to tenants before entry is handled as separate tasks: 'Give tenants 24hr heads up', 'let tenants know about photos 24hrs in advance', 'communicate possible downtime to tenants 48hrs in advance'. Occupancy goes into titles: 'Finish room and remove material upper, tenant occupied'.
- **Why:** Contractors get logins on Oct 29 and will schedule visits. Knowing whether a unit is occupied decides whether a tenant needs notice, so the app should say so where the visit is scheduled, without handing tenant details to contractors (the D16 risk raised in G1B-005).
- **Change:** When a job with a unit is set to Scheduled (D6c) and the unit is occupied, the staff rail shows 'Occupied · tell the tenant by Oct 27' with a 'Text tenant' link (sms: to the tenancy's phone, when one is recorded). The contractor's job page shows only 'Occupied unit · knock first', never the tenant's name or phone.
- **Desktop, tablet, phone:** 1280 and 768: one rail line. 375: a line under the job's address block, with the Text link full width on the staff side.
- **Reuse:** The task rail (spec §6), the Tenancy phone, and D21's unit lookup.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): Context chips under the title carry state without a new section
  - [Jobber](https://mobbin.com/screens/7c66f8f1-8ea8-4582-98bf-a0f88dcccf56): A call action sits in the header of the client record on phone
- **Code:** `branch: src/lib/property-types.ts:19-24`, `branch: prisma/schema.prisma:645-668 (Listing; no tenancy model)`, `branch: src/app/(app)/tasks/[id]/fields.tsx:132-168`
- **Verification:** confirmed. The cited titles exist (15 Oxford, 118 Congress, 415 Crescent, 725 Linwood). The 'Occupied' rail line and a contractor-safe line are worth it now that contractors get logins Oct 29. Drop the 'Text tenant' sms link: it means storing tenant phones in the OS, and each tenant already has a group text from the NEW TENANT playbook. The rail line alone does the job.

### G2C-I03

**Draw the turnover as one dated strip: Notice, Out, Turn, Listed, Signed, In, First rent**

Medium · Design change · effort M · `Unit sheet (D10 Units tab, G2C-009)` · Rentals, residents and the public site run one lifecycle

- **Today:** No screen shows a turn because the app stores no tenancy, notice or turn record at all (Prisma has no lease model, and the rent roll says 'No lease data yet'). The Tasks-card rows cited are rehab tasks at a property in Rehabbing status, not turn work.
- **Why:** Resend shows an email's whole life as one horizontal strip with a date under each step. Brex draws the next step hollow with its expected date. With the same strip, Connor and Pieter could read every open turn at a glance without opening tasks.
- **Change:** Under the unit sheet header, show a 7-step strip while a turn is open. Done steps get a check and a date ('Out · Nov 30'). The current step is bold with its count ('Turn · 6 of 11'). Future steps are hollow with an expected date ('In · Dec 15'). Tapping a step filters the sheet's task list to that phase. Occupied units with no open turn show no strip.
- **Desktop, tablet, phone:** Desktop 1280: horizontal strip across the sheet. Tablet 768: horizontal with short labels ('Out', 'In') and dates below. Phone 375: a vertical list in Brex style with dates right-aligned; only the current and next steps show detail, and the rest are one line.
- **Reuse:** New component based on Resend and Brex; Badge tones from src/components/ui.tsx; the vertical variant is shared with G2C-I10.
- **References:** 
  - [Resend](https://mobbin.com/screens/046759e2-bf3e-4fd5-899f-a115278d5f8c): EMAIL EVENTS strip: Sent → Delivered → Opened, an icon per step and a date under each.
  - [Brex](https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811): Vertical status: done steps checked with dates, the future step hollow with 'estimated on Jan 22'.
  - [Wise](https://mobbin.com/screens/ea2fde3e-8b3e-4ef8-92d9-ea5dc9e51fda): Current step in bold and the rest muted, under an Updates / Details switch.
- **Verification:** partly. The strip itself is a sound fit for the D10 Units tab, as long as it's hidden when no turn is open. But the evidence misreads the data: 767 Prospect's header badge says 'Rehabbing' (verify-G2C/p767--desktop-light.png), and its open tasks ('767 Prospect bathroom finish', 'Mud Drywall', 'take $20k draw', 'post-refi, update the rent bank…') are rehab and refinance work, not a tenant turn. The finding depends on the tenancy/turn record from G2C-002, because the rent roll states 'No lease data yet'. The references weren't spot-checked but are plausible.

### G2C-I05

**Add a Moving out page with checkout steps and a forwarding address for the deposit**

Medium · New capability · effort M · `Public /residents and a new /residents/moving-out` · Rentals, residents and the public site run one lifecycle

- **Today:** /residents lists Moving In, Pay Rent and Request Maintenance (Soon). A departing tenant gets no guidance on where the keys go or what clean means. Nothing asks where to send the deposit statement, and notices still arrive by text.
- **Why:** Airbnb hosts write checkout instructions that guests can read before they arrive (Gather used towels, Throw trash away, Turn things off, Return keys), so a departure needs no back-and-forth. New York's 14-day itemized deposit statement (G2C-012) needs a forwarding address, and today HG has to chase it.
- **Change:** /residents/moving-out mirrors Moving in. Four short steps: 'Book your walkthrough', 'Leave it broom clean', 'Keys back in the lockbox', 'Take utilities out of your name the day after you leave'. Then one small form: move-out date, 'Where should we mail your deposit statement?', and email. Submitting puts one row on Home, 'Dana says she's moving out Nov 30 · 767 Prospect, Lower Front', with a 'Record notice' button that opens G2C-004's sheet prefilled. Add a Moving out tile to /residents.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the same single max-w-2xl column as Moving in. Phone 375: steps stack, the form is three fields, and Submit spans the full width.
- **Reuse:** Layout from src/app/(marketing)/residents/moving-in/page.tsx; honeypot and RateLimiter from moving-in/actions.ts; PublicHeader and PublicFooter; the Home row joins G2C-010's unit rows.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/748d238c-16f7-42dd-9417-edac08fb7d48): Checkout instructions as four icon rows (Gather used towels, Throw trash away, Turn things off, Return keys), readable before the stay.
  - [Airbnb](https://mobbin.com/screens/fc6b314f-c9b0-4ce8-bdc2-a68c51017c08): Next-step card 'Add checkout instructions · Tell guests how to lock up and leave'.
- **Code:** `src/app/(marketing)/residents/page.tsx`
- **Verification:** confirmed. /residents shows Moving In, Pay Rent and Request Maintenance (Soon) (verify-G2C/residents--mobile-light.png, residents/page.tsx:25-37). The tile grid is sm:grid-cols-3, so a fourth tile leaves an orphan at desktop. Plan a 2x2 grid. The form becomes a second unauthenticated write path, so it needs the same honeypot and rate limits, which the recommendation already names. I didn't spot-check the Airbnb references.

### G2C-I11

**Track four move-in checks per tenancy and raise only the one that blocks keys**

Medium · New capability · effort S · `Unit sheet tenancy block and Home` · Rentals, residents and the public site run one lifecycle

- **Today:** The public checklist says keys are dropped off 'once utilities are confirmed set up' and asks tenants to email their insurance policy. The app has nowhere to record deposit received, utilities transferred, insurance on file or keys handed over. Home shows a greeting, three counts and the CapEx forecast, and nothing about an upcoming move-in.
- **Why:** Airbnb pins the one blocking item ('Confirm important details · Required to publish') above everything else instead of listing every setting. Brex marks only the missing piece. Keys are the one step where an open check actually blocks the tenant.
- **Change:** Give each new tenancy four checks, Deposit, Utilities, Insurance and Keys, each a single tap that stamps the date. Home shows one row only when a move-in is 3 days out and a check is still open: 'Sam moves in Dec 1 · utilities not confirmed'. The same checks drive the tenant's timeline (G2C-I10).
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a row of four small check chips in the tenancy block. Phone 375: a 2x2 grid of 44px chips. The Home row follows G2C-010's row format at every size.
- **Reuse:** Badge tones; pending state with useTransition as in src/components/ui.tsx guidance; Home rows from G2C-010.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): One pinned blocker card above the Today / Upcoming switch.
  - [Brex](https://mobbin.com/screens/c8be2a3e-11cf-4d3d-a6ae-1274a75c167c): Only the missing requirement is flagged, with a plain reason.
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:41-62`
- **Verification:** confirmed. Accurate. The checklist says keys come 'once utilities are confirmed set up' and asks tenants to email their policy, and nothing in the schema records deposit, utilities, insurance or keys. Home is a greeting, three counts and CapEx (verify-G2C/home--mobile-light.png). It needs the tenancy record. Its Home row ('Sam moves in Dec 1 · utilities not confirmed') overlaps the move-in row in G2C-I14, so keep this one.

### G2C-I18

**On phones, open a unit as action rows: Lockbox, Text tenant, Utilities, Baselane**

Medium · Design change · effort S · `Unit sheet on phone (property lookup job)` · The phone is a chosen subset, and touch has no hover

- **Today:** Confirmed: the Units & access heading sits at 1,222px on a 375x667 phone, the page is 3,836px, and each unit shows a lock emoji, '7676', and collapsed Utilities and Equipment. But no tenant name, phone or Baselane link is stored, so 'Text Dana' and 'Lease and ledger' have no data. Only the Lockbox and Utilities rows (account numbers, autopay, LOFL) are possible today. The settled D10 Units tab already removes the scroll depth.
- **Why:** On site, the jobs are opening the door, reaching the tenant and finding the utility account. Monzo turns a record into action rows, each with a one-line sublabel, which works by touch with no hover. Jobber's visit screen puts call and Directions at the top with one primary action.
- **Change:** A unit opened on a phone leads with four action rows, each with a sublabel: 'Lockbox · tap to reveal', 'Text Dana · (716) …', 'Utilities · National Grid, acct ending 4411', 'Lease and ledger · opens Baselane'. Status chips and the turnover strip (G2C-I03) follow. On desktop and tablet these become entries in the facts rail.
- **Desktop, tablet, phone:** Phone 375: action rows first, 56px tall with sublabels. Tablet 768 and desktop 1280: the same facts sit in the right rail as label and value pairs, with no action rows.
- **Reuse:** Field from src/components/ui.tsx; lockbox reveal from G2C-V03; lucide-react line icons.
- **References:** 
  - [Monzo](https://mobbin.com/screens/8c3f384b-fb41-47ed-8fc9-52b22fa2f294): Stacked action rows ('Add notes and #tags', 'Add receipt') and a toggle whose sublabel says what it does.
  - [Jobber](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42): Call icon in the header, Directions, then one primary 'Complete Task'.
- **Verification:** partly. Lockbox and Utilities rows can ship now. The others wait on the tenancy record. The lock emoji next to the code also breaks the 'no emoji decoration' rule.

### G2C-IV01

**Show the listing's Available date on the public card and in the Rentals row**

Medium · Fix · effort S · `Public /rentals card and the Rentals card on /properties/[id]` · Rentals, residents and the public site run one lifecycle

- **Today:** The listing editor saves an Available date (Listing.availableDate), but /rentals never selects or renders it, since ListingCardData has no date field. The admin Rentals row shows only rent, beds, baths and sqft, or 'No details yet'. A renter can't tell when a unit opens. The admin row also prints rent as '$1200/mo', while the public card prints '$1,200/mo'.
- **Why:** Move-in date is the first thing a renter filters on, and the data is already entered, then dropped. Zillow puts 'Available Jul 21 2026' on the unit and gives its units table an Available column ('Now', 'Jul 21').
- **Change:** Add the date to the card's details line: '2 bd · 1 ba · 850 sqft · Available Dec 15', or 'Available now' when the date is today or past. Show the same token in the admin row after the badge, and format rent there with fmtMoney.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one details line. Phone 375: the line may wrap to a second line. At 320, drop sqft first.
- **Reuse:** ListingCard in src/app/(marketing)/rentals/page.tsx; ReadListings in src/app/(app)/properties/[id]/edit-listings.tsx; fmtDay and fmtMoney.
- **References:** 
  - [Zillow](https://mobbin.com/screens/558ec748-c7ad-4aee-bb26-3ff3b71b8b00): Unit detail lists 'Available Jul 21 2026' beside sqft, under '2 beds, 2 baths | $2,884'.
  - [Zillow](https://mobbin.com/screens/33d4307f-0f26-44a8-bf28-298ba22f160b): Units table has an Available column reading 'Now' or 'Jul 21'.
  - [Realtor.com](https://mobbin.com/screens/9332fbd1-5551-43c8-a5d0-19072eea9a7e): Status line ('For rent') above price on the card.
- **Code:** `src/app/(marketing)/rentals/page.tsx:12-23`, `src/app/(marketing)/rentals/page.tsx:26-46`, `src/app/(app)/properties/[id]/edit-listings.tsx:232-240`, `src/lib/properties/service.ts:275`, `prisma/schema.prisma:305`, `src/app/(marketing)/rentals/page.tsx:35-46`, `src/app/(app)/properties/[id]/edit-listings.tsx:340-345`, `src/app/(marketing)/rentals/page.tsx:12-23 (ListingCardData has no available date) and 35-46 (mapping omits availableDate)`, `prisma/schema.prisma:304 (Listing.availableDate)`
- **Also found as:** PUBLIC-027 (Login and the public site), PUBLIC-V05 (Login and the public site), G1E-I15 (What leaves the app: printouts, PDFs and the Google listing), G2C-035 (A unit changing tenants, end to end: notice, turn, listing, move-in report and first rent)
- **Verification:** verifier-found

### G2C-V02

**Give each listing photo a visible '…' menu on touch instead of invisible hover buttons**

Medium · Design change · effort S · `Property page, Rentals editor photo strip` · The phone is a chosen subset, and touch has no hover

- **Today:** Each photo's Remove, Move left and Move right buttons are 20px circles at opacity 0 until hover (edit-listings.tsx:477-504), with no touch fallback. On a phone or tablet they can't be seen but still take taps, so a tap near a photo's top-right corner removes it unseen, and nothing shows how to reorder or set the cover. I couldn't render one with photos because no local listing has any; the behavior is clear from the code, and the empty editor renders at 375.
- **Why:** Listing photos get taken on site, on a phone, so this is the main device for this editor. The house rule is that touch has no hover, and 20px is far under the 44px tap target.
- **Change:** On coarse pointers, show one 44px '…' button in each photo's corner. It opens a menu with Make cover, Move earlier, Move later and Remove. Keep the 'Cover' label on the first photo, and keep today's hover controls for the mouse.
- **Desktop, tablet, phone:** 1280: unchanged hover controls. 768: a persistent '…' that opens a popover menu. 375: the same '…', opening a bottom action sheet with 44px rows.
- **Reuse:** PhotoGallery in src/app/(app)/properties/[id]/edit-listings.tsx; React Aria menu and sheet (approved).
- **References:** 
  - [Airbnb](https://mobbin.com/flows/99ae5c0a-c4e8-4bac-98d5-f00587611ead): The flow's photo sheet lists Move backward, Move forward, Make cover photo, then Delete set apart. That's the tap menu for each listing photo.
  - [Airbnb](https://mobbin.com/screens/0701edf9-3ec2-4c5a-8b92-50c341d40d98): Phone photo grid: a persistent '…' on every photo, a 'Cover photo' label and 'Drag to reorder'
  - [Turo](https://mobbin.com/screens/68cd7399-0982-4845-9b2a-e25e0430c38b): Destructive action kept separate and explained on phone
  - [Airbnb](https://mobbin.com/screens/8d239705-3784-4839-b6f3-6d39161ce479): 'Manage photos' as an explicit action, with a '1 photo removed' toast confirming the change
  - [Airbnb](https://mobbin.com/screens/5c62c16b-2297-45d7-b8ee-288cd20794a2): Photo tour grid with clear per-room photo counts
  - [Craft](https://mobbin.com/screens/6724ed7d-c631-4b7e-a26f-a44f83b6bc12): Item action sheet with plain rows and a red destructive last row
  - [Joi](https://mobbin.com/screens/232e633c-a229-47bd-9e95-53acc546fa99): Long-press sheet with Complete, Edit and Remove as large targets
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:474-508`, `Local DB: 0 ListingPhoto rows, so the photo state couldn't be rendered`, `src/app/(app)/properties/[id]/edit-listings.tsx:477-507`, `src/app/(app)/properties/[id]/edit-listings.tsx:470-495`
- **Also found as:** PROPERTY-005 (Property detail page (future property hub)), MOBILE-016 (Lens: phone and tablet experience on every route)
- **Verification:** verifier-found

### G2C-019

**Give each unit one short name, and keep the other names as search aliases**

Low · Fix · effort S · `Unit names, as used by listings, tasks, CapEx and the public site` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Still applies on the migration branch. The branch database still stores double names: 428 Normal 'Floor 1 / Lower' and 'Floor 2 / Upper'; 58 Mariner 'Floor 2 / Upper'; 725 Linwood '1st Floor / Lower' and '2nd Floor / Upper'; 765 Prospect 'Floor 1 / Lower'; 767 Prospect 'Upper / Upper Front'. The task page's Unit picker shows labels exactly as written (fields.tsx:138-139). The contractor job page appends the label after the address ('118 Congress St. Buffalo, NY 14213 · Rear'), so a contractor at 767 would read '... · Upper / Upper Front'.
- **Today:** Five properties store two names in one label: 'Upper / Upper Front', '1st Front / Lower Front', '1st Rear / Apt #3', 'Floor 1 / Lower', '1st Floor / Lower'. Tasks then use a third form ('front lower', 'lower', 'rear unit'). The label goes public unchanged ('1st Front / Lower Front' on /rentals) and wraps to five lines in the listing row at 320.
- **Why:** A slash name is two labels pretending to be one. It makes rows long and public copy odd (COPY-019), and it still doesn't match how people type. Short names plus aliases is how search-first tools handle nicknames.
- **Change:** Give each unit one short name ('Upper', 'Front', 'Rear', 'Lower') and use it everywhere. Add an optional 'Also called' field ('Upper Front', 'Apt 3') that global search and the task unit picker match against. Clean up the five properties' labels once with Connor.
- **Desktop, tablet, phone:** Short names keep unit rows to one line at 375 and 320.
- **Reuse:** The Unit model; SHELL-V01's search normalization.
- **References:** 
  - [Zillow](https://mobbin.com/screens/afce10d7-7bd9-4529-96fe-c1e1ab8d2434): Units go by one short name ('Unit 145') that fits a phone row
- **Code:** `Local DB Property.units labels at 428 Normal, 58 Mariner, 725 Linwood, 765 and 767 Prospect`, `branch: src/app/(app)/tasks/[id]/fields.tsx:133-143`, `branch: src/lib/property-types.ts:19-24`
- **Verification:** partly. The five slash labels are confirmed in the DB, and the 320 wrap is confirmed. Two problems with the recommendation. Drop the 'Also called' field: each property has 2 to 4 units, so the picker list is tiny and an alias field adds a form row for little gain. And 'Apt #3' may be the official designation used on leases, BMHA forms and rental registration, so confirm which name is official before cutting it. The rename must also wait for G2C-001's ids, or it orphans the 767 listing. This is a copy cleanup, so low.

### G2C-020

**Stop listing all 11 owned addresses on the public move-in form**

Low · Fix · effort S · `/residents/moving-in, Property select` · Rentals, residents and the public site run one lifecycle

- **Today:** The public move-in form lists all 11 owned addresses, including a flip in rehab where nobody moves in. The addresses themselves are public record, so the cost is a long list with wrong choices rather than a leak.
- **Why:** It leaks the portfolio and invites wrong picks. A resident only needs their own home.
- **Change:** Now: limit the select to properties with a listing marked Leased in the last 60 days, or with status Refinanced or Stabilized. Once G2C-005's personal link exists, remove the select: the link carries the tenancy, and the form shows 'Front, 767 Prospect' as plain text.
- **Desktop, tablet, phone:** The same at every width.
- **Reuse:** PUBLIC-045's personal link.
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:81`, `Eval of the select's options on /residents/moving-in: 11 addresses including 23 Sherwood (Rehabbing, Flip)`
- **Verification:** partly. Reproduced signed out: the select lists all 11 addresses, including 23 Sherwood (Rehabbing, Flip). 'Leaks the portfolio' is overstated: deed ownership is public record and /rentals already shows three addresses. The interim filter is harmful. No listing has ever been Leased, and filtering on Refinanced or Stabilized would hide 767 Prospect (Rehabbing, yet occupied by Maritza and ZeChen) and 415 Crescent and 765 Prospect, which have tenants. Real residents couldn't file. At most, exclude strategy Flip until the personal link (PUBLIC-045) replaces the select.

### G2C-021

**Fill the turnover playbooks' gaps: utilities, lockbox, and one copy of the lease**

Low · Fix · effort S · `MOVE OUT and NEW TENANT playbooks (D28)` · Rentals, residents and the public site run one lifecycle

- **Today:** MOVE OUT lacks a lockbox code change (all three 767 units share one code) and NEW TENANT stores the lease twice. The open LOFL transfer tasks belong to the NEW REFI playbook, and LOFL enrollment already reverts utilities to HG at move-out.
- **Why:** D28 ships these playbooks as they are before cutover. G1C-040 cleans their wording, but the missing steps are why each turnover still needs ad hoc tasks.
- **Change:** Add to MOVE OUT: 'Switch National Grid and National Fuel back to our account' (due on move-out day) and 'Change the lockbox code' (move-out + 1). 'List the unit' isn't a step, because Record notice drafts the listing (G2C-007). In NEW TENANT, drop 'Store signed lease' (Baselane keeps it) and keep 'Confirm utilities are in the tenant's name' ahead of 'Give keys'. When the utilities step is done, the unit's utilities read 'In tenant's name since Dec 1'.
- **Desktop, tablet, phone:** Task rows at every width.
- **Reuse:** TaskTemplate rows and G1C-040.
- **Code:** `Local DB template rows in 'NEW MOVE OUT [Address]' (6) and 'NEW TENANT [Address]' (10)`, `asana-migration-plan.md:89 (D28)`
- **Verification:** partly. The utilities evidence is misattributed. The open 'Transfer LOFL national fuel/grid' tasks at 767, 765 and 118 Congress come from the NEW REFI [Address] playbook (moving the landlord program to the refinancing LLC), not from a turnover. The LOFL landlord programs (National Fuel's landlord program, National Grid's Landlord Enroll) put service back in the landlord's name automatically when a tenant closes their account, so 'Switch utilities back to our account' is redundant. 'Confirm utilities reverted to us' is the most it needs. The lockbox step is valid: all three 767 units share one code. The double lease storage is valid. Missed point: MOVE OUT holds a near-duplicate pair, 'Paint [tenant] unit' (stored DONE) and 'Clean & Paint [tenant] unit', which the D28 loader may copy as two steps.

### G2C-022

**Show how long a unit has been vacant and what that has cost**

Low · New capability · effort S · `Units table, unit sheet and the Portfolio figure strip` · Rentals, residents and the public site run one lifecycle

- **Today:** A vacant unit shows only a green 'Available' badge and 'No details yet'. Nothing says it has been empty since before the Aug 31 import. The 2025 turn at 767 (walk-through Oct 28, new tenant on Baselane Nov 10) took about two weeks, and that's recorded only in task dates.
- **Why:** Vacancy is the largest cost a 31-unit owner controls. Ramp's habit is to put the money next to the state, so the decision makes itself.
- **Change:** Vacant units read 'Vacant 23 days' in the Status cell, and the sheet adds '$880 of rent so far' (days times last rent divided by 30). Start tenancy stores the turn's length (move-out to move-in) on the tenancy. Once there are three turns, Portfolio's figure strip (PORTFOLIO-006) can show 'Average turn 19 days'.
- **Desktop, tablet, phone:** Status text is the same at every width. The cost line appears only in the sheet.
- **Reuse:** Tenancy dates and PORTFOLIO-006's strip.
- **References:** 
  - [Flighty](https://mobbin.com/screens/b8a92b60-b6d2-4d5c-99e3-cc311a24118d): Each leg states 'On Time' in green or '1h 9m Late' in red, one plain line in a fixed spot. 'Vacant 23 days' should read the same way.
  - [Mercury](https://mobbin.com/screens/d989795f-1f53-4ea4-9f9e-bf05ab5fa6ca): Overdue tile pairs a count with money ($8.20), color only on the overdue number. Vacancy cost belongs in that form.
  - [Turo](https://mobbin.com/screens/69f93658-54ac-4cb3-9b57-a6b9a57037e0): Vehicle card carries 'Last trip: Mar 5 - Mar 6', the gap since use at a glance
  - [Remote](https://mobbin.com/screens/e2474395-d7d2-491b-9827-738450004079): '1 day remaining' as plain text above the status, with dates in rows
- **Code:** `Local DB: Listing rows updatedAt 2026-08-31, rent null, 0 photos`, `Local DB 767 history: 'Dan unit walkthrough' Oct 28 2025, 'Get [ZeChen 767 Prospect] on Baselane' Nov 10 2025`
- **Verification:** partly. 'Vacant 23 days' in the Status cell is already part of G2C-003's column spec, so that half duplicates. What's left is a cost line in the sheet and an 'Average turn' figure after three turns: reasonable Ramp-style touches, but polish, not medium.

### G2C-023

**Give unit status its own quiet tones and retire the amber 'Hidden' badge**

Low · Design change · effort S · `Unit status and listing status marks` · One design system, fixed in the primitives

- **Today:** Listing badges use green Available, gray Leased and amber Hidden, and amber also marks Rehabbing. No listing is Hidden today, so the clash is latent.
- **Why:** The house rule is that each status keeps a fixed Badge tone no other mark in the view reuses, and that color marks identity or state. A table full of green 'Occupied' badges would be noise. Stripe and WRITER show the normal state quietly (a dot and a word) and color only the exceptions.
- **Change:** Occupied: plain text, no badge. Notice: amber badge with its date. Vacant: red text ('Vacant 23 days'), since red means money is being lost. Leased with a future move-in: gray badge 'Leased, Dec 1'. Listing: a small green dot plus 'Listed' when Live, gray text 'Draft' otherwise. Retire 'Hidden' and the amber listing tone, and agree with PORTFOLIO-015 to move Rehabbing off amber.
- **Desktop, tablet, phone:** The same marks at every width.
- **Reuse:** Badge tones in src/components/ui.tsx; VISUAL-011's single StatusPill.
- **References:** 
  - [Stripe](https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6): One status chip per row in a fixed column, carrying its date; neutral states stay gray.
  - [Airbnb](https://mobbin.com/screens/d8494673-d50a-497f-b350-c4646a14db7c): Listing cards show one pill in a fixed top-left corner ('Action required', 'In progress') with a small colored dot instead of a filled badge.
  - [WRITER](https://mobbin.com/screens/c5f7835d-55be-403a-adce-15d96f057aba): Status as a small dot plus a word ('Deployed', 'Draft'), quiet in a dense table
  - [Stripe](https://mobbin.com/screens/bc21762d-28b7-487c-b34e-7973e5e7e4b9): Only the exception carries a tinted pill with its date
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:25-34`
- **Verification:** partly. No listing is Hidden today, so the amber collision isn't visible yet. Rehabbing amber is. The Stripe rationale is inaccurate: Stripe tints normal states too, with a green 'Succeeded' pill and a blue 'Trial ends' pill (https://mobbin.com/screens/373146e1-8686-43b0-8a10-5da707dc8873, https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6). Plain 'Occupied' is still the calmer choice. Red 'Vacant' text only works once D10 tabs put Units in a different view from the CapEx 'Due soon' red. On today's single page they'd share red.

### G2C-028

**Show the unit beside the property on task rows instead of typing it into titles**

Low · Design change · effort S · `Task rows (Tasks list, the property Tasks tab, Home)` · Home and Today become one work queue

- **Migration branch:** Rebuilt on the migration branch; this describes the branch
- **Today:** Rows on Today, All and Home now show the unit beside the property: TaskRow builds 'place · unit' (task-row.tsx:57), and the contractor job page reads '118 Congress St. ... · Rear'. Two lists still leave it out: the property page's Tasks card (/properties/cmtg25y4k0002jphsxww4tv6k; title, status, avatar, date only) and the contractor page's Jobs list (/contractors/cmtg25y9x000djphsbqty81fr). Imported titles still carry units, such as 'Cabinet install Unit 2', 'Unit 3 Electrical fixes' and 'unit 3 list of issues', because the Asana import never sets unitLabel from the title.
- **Why:** Titles end up doing a field's job, and that makes them long, inconsistent and impossible to filter. A unit field (G2C-001) only helps if rows show it.
- **Change:** Show the unit on the property Tasks card and the contractor Jobs rows. The simplest route is to render those lists with TaskRow. During the import or cutover cleanup, set unitLabel where a title names a unit, and keep units out of playbook step titles.
- **Desktop, tablet, phone:** 1280 and 768: in the property cell. 375: in the row's subline (MOBILE-029).
- **Reuse:** Task rows; TASKS-016's column changes.
- **References:** 
  - [Linear Mobile](https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8): Project shown as a chip beside the issue, not repeated in its title
- **Code:** `branch: src/app/(app)/tasks/task-row.tsx:57`, `branch: src/app/(app)/properties/[id]/page.tsx:194-217`, `branch: src/app/(app)/contractors/[id]/page.tsx:133-156`
- **Verification:** confirmed. Seen in verify-G2C/tasks-tenant--desktop-light.png: units and tenants are typed into titles, and the Address cell shows only the property. This is cheap once the spec's task unit field exists.

### G2C-029

**Replace '3 units' in the property header with occupancy**

Low · Design change · effort S · `Property hub header` · Rentals, residents and the public site run one lifecycle

- **Today:** The header reads '767 Prospect Avenue, Buffalo', then a Rehabbing badge, then '3 units' (page.tsx:90). The property shows as Rehabbing while at least two of its units pay rent, judging by the BMHA rent tasks.
- **Why:** That subline is the one place outside the Units tab where occupancy can show without adding chrome, and it keeps the D10 sidebar property rows plain (IA-016).
- **Change:** Subline: '3 units · 1 vacant', or plain '3 units' when every unit is occupied. Nothing about occupancy goes in the sidebar.
- **Desktop, tablet, phone:** Same text at every width; it wraps under the address at 375.
- **Reuse:** The hub header (IA-039's anatomy).
- **References:** 
  - [Zillow](https://mobbin.com/screens/cc09445f-c80c-470e-8497-0630e416eafd): One status next to the address in the property header, nothing more
- **Code:** `src/app/(app)/properties/[id]/page.tsx:75-90`
- **Verification:** confirmed. The header reads 'Rehabbing · 3 units' (page.tsx:84-90) while BMHA rent tasks show tenants paying. It uses the same '3 · 1 vacant' format as G2C-013, which keeps the language consistent.

### G2C-031

**Show last rent beside the asking rent when listing a unit**

Low · New capability · effort S · `Unit listing editor` · Rentals, residents and the public site run one lifecycle

- **Today:** 'Rent / month' is a blank raw number box with no reference point.
- **Why:** Underpricing a relisted unit by $50 costs $600 a year. The last rent is the obvious anchor, and the tenancy will hold it.
- **Change:** Default the asking rent to the last tenancy's rent, with a helper line under the field: 'Last rent $1,150, ended Nov 30'.
- **Desktop, tablet, phone:** The helper stays one line at 375 ('Last rent $1,150').
- **Reuse:** The Tenancy record and PROPERTY-033's money field.
- **References:** 
  - [Airbnb](https://mobbin.com/flows/99ae5c0a-c4e8-4bac-98d5-f00587611ead): In the Listing a place flow, the price step shows 'Tip: $168' right under the heading, beside a large editable price. Show last rent the same way: 'Last rent $1,150'.
  - [Zillow](https://mobbin.com/flows/dd1f0388-8743-42f3-a1d0-ef1babc87e58): Listing flow pairs the rent input with guidance beside it
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:349-357`
- **Verification:** confirmed. The 'Rent / month' field is a bare number input (edit-listings.tsx:349-357, seen in verify-G2C/p767edit--added--desktop-light.png). The helper line is enough. Don't prefill the field, or the old rent becomes the default anchor.

### G2C-032

**End Start tenancy on a payoff that says what happens next**

Low · Design change · effort S · `Start tenancy, after save` · Rentals, residents and the public site run one lifecycle

- **Today:** Nothing marks the moment a unit is leased. Saving Rentals just closes edit mode (edit-listings.tsx:82-94). The only payoff in the app is the move-in sent screen.
- **Why:** Leasing a unit is the turnover's payoff, and the house rule says to show what happened and what's next rather than ending on a check mark.
- **Change:** After Start tenancy, the sheet shows simple single-color line spot art (a door and key), the heading 'Front is leased', the line '(first name) moves in Dec 1', and two next steps: 'Copy move-in link' and 'Keys after utilities are confirmed' (the NEW TENANT task). The listing is already down; a small 'Taken off the rentals page' line confirms it.
- **Desktop, tablet, phone:** Inside the sheet at 1280 and 768; a full-screen state with a Done bottom bar at 375. Respects reduced motion.
- **Reuse:** Spot art (Known gaps in docs/components.md) and the Start tenancy sheet.
- **References:** 
  - [Gusto](https://mobbin.com/screens/d2374056-9f3d-4c85-ba90-5e57c138639c): Submitted screen: line art, a plain heading, one summary row, a per-person table with expected dates, and two next actions (See pay history, Create another payment).
  - [Zillow](https://mobbin.com/screens/2a203487-bc43-46d3-bdb6-6b3903e37bcb): After Add tenants, the page itself shows what's next (condition report, lease) in a Next steps rail.
  - [Turo](https://mobbin.com/screens/361a77ec-41f2-4e64-9dc9-3e94bffbf6ad): Payoff screen: what happened, then the first concrete next step
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:82-94`, `docs/components.md:65`
- **Verification:** confirmed. This follows the house payoff rule. Evidence line ref is off: Toast is docs/components.md:66 and spot art is :145.

### G2C-033

**A listing saved without a unit goes public as 'Unit'**

Low · Fix · effort S · `Property page, Rentals editor` · Rentals, residents and the public site run one lifecycle

- **Today:** '+ Add listing' starts on a disabled 'Select unit…' placeholder, and Save doesn't check it. replaceListings stores unitLabel.trim() || 'Unit' (service.ts:269), so a listing set to Available shows on /rentals labeled 'Unit'. The read view's fallback says 'Unlabeled unit' (edit-listings.tsx:226), which disagrees with what's stored.
- **Why:** A public card that says 'Unit' looks unfinished, and nothing stops it.
- **Change:** Block Save with an inline 'Pick a unit' on the card. G2C-007 removes the select altogether.
- **Desktop, tablet, phone:** Inline message under the select at every width.
- **Reuse:** The inline save-error pattern from docs/components.md.
- **Code:** `src/lib/properties/service.ts:269`, `src/app/(app)/properties/[id]/edit-listings.tsx:226`, `src/app/(app)/properties/[id]/edit-listings.tsx:281-289`
- **Verification:** confirmed. Reproduced. With a blank 'Select unit…' card, Save posted immediately with no client check, and the server stores unitLabel.trim() || 'Unit' (service.ts:269, zod accepts ''). New listings default to Hidden, so it goes public only if someone sets Available.

### G2C-034

**The listing row breaks the unit name one word per line at 320**

Low · Fix · effort S · `Property page, Rentals read view at 320` · The phone is a chosen subset, and touch has no hover

- **Today:** At 320, '1st Front / Lower Front' breaks into five lines ('1st', 'Front', '/', 'Lower', 'Front') because the Available badge and the 'Zillow ↗' link keep their width beside it.
- **Why:** Things that should line up don't: the row grows to five lines while the badge floats in the middle of it.
- **Change:** Below 400px, put the badge and the Zillow link on the second line so the name gets the full width. G2C-008 and G2C-019 replace this row later.
- **Desktop, tablet, phone:** Only below 400px; 768 and 1280 are unchanged.
- **Reuse:** src/app/(app)/properties/[id]/edit-listings.tsx ReadListings.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:214-252`
- **Verification:** confirmed. Reproduced at 320 dark: '1st Front / Lower Front' breaks into five lines beside the Available badge and the Zillow link (verify-G2C/p767n--rentals--narrow-dark.png).

### G2C-036

**Units keep entry order, so 58 Mariner lists Floor 2 before Floor 1**

Low · Fix · effort S · `Units & access order (58 Mariner)` · Rentals, residents and the public site run one lifecycle

- **Today:** Units render in JSON array order with no sort field. 58 Mariner shows 'Floor 2 / Upper' above 'Floor 1 / Lower'.
- **Why:** Order carries meaning in a table of units. A building read top-down on one property and bottom-up on another makes partners re-read every time.
- **Change:** Add sortOrder to the unit with a drag handle in the Units editor, and default to floor order (lower floors first).
- **Desktop, tablet, phone:** The same order at every width.
- **Reuse:** The Unit model (G2C-002).
- **Code:** `Local DB: 58 Mariner units 'Floor 2 / Upper | Floor 1 / Lower'`
- **Verification:** confirmed. DB order is 'Floor 2 / Upper | Floor 1 / Lower'. Simpler interim: array order already is the display order, so a one-time reorder (plus up and down in the units editor) fixes it. Add sortOrder when units become a table. A drag handle is more chrome than four rows need.

### G2C-037

**Split the lockbox location out of the code field**

Low · Fix · effort S · `Units & access lockbox field (15 Oxford), feeding the D21 job page` · Rentals, residents and the public site run one lifecycle

- **Today:** 15 Oxford's lockbox fields mix the code with prose: '1924 (back entrance)', '2925 (back entrace)', '4857 (back left corner of the house)'. D21 will show this field to contractors on turn jobs, and G1A-020 plans to render it as large copyable digits.
- **Why:** Copy-to-clipboard and large digits break when the field holds a sentence, and the location is useful information that deserves its own line.
- **Change:** Give the unit two fields, Lockbox code (digits only) and Lockbox location ('Back entrance'). Migrate the three 15 Oxford rows, fixing the 'entrace' typo, and show the location under the code on the job page.
- **Desktop, tablet, phone:** The location line sits under the code at every width.
- **Reuse:** The Unit model; G1A-020's lockbox display.
- **Code:** `asana-migration-plan.md:82 (D21)`
- **Verification:** confirmed. The DB shows the three 15 Oxford codes with parenthetical locations, including the 'entrace' typo. It's timely because D21 shows codes to contractors from Oct 29.

### G2C-I02

**Show what Record notice and Start tenancy will do before you confirm**

Low · New capability · effort M · `Record notice and Start tenancy sheets (unit sheet, proposed in G2C-004 and G2C-005)` · Rentals, residents and the public site run one lifecycle

- **Today:** No notice or new-tenant action exists, so there's nothing to preview yet. The risk only appears once G2C-004/005 are built.
- **Why:** A commit that drafts a public listing and dates a dozen steps should show its consequences first. Stripe's Create subscription keeps a Summary pane ('5 December 2024 · Subscription starts', 'First invoice · Amount due') that updates as you type. Without that pane, a mistyped move-out date silently misdates every MOVE OUT step.
- **Change:** Give both sheets a Summary pane that recalculates as fields change. Example: 'Nov 30 · Dana moves out', 'Nov 30 · Listing drafted at $1,200, available Dec 15', 'Dec 14 · Deposit statement due', '9 MOVE OUT steps · first due Nov 2'. The confirm button restates the action: 'Record notice and create 9 steps'.
- **Desktop, tablet, phone:** Desktop 1280: two-column sheet, fields left and Summary right. Tablet 768: Summary stacks under the fields. Phone 375: Summary collapses to one line, 'Creates 9 steps · drafts listing', which expands on tap; the confirm button is pinned to the bottom.
- **Reuse:** New sheet on React Aria (approved); Summary rows use Field and fmtDay (src/lib/dates.ts). Builds on G2C-004 and G2C-005.
- **References:** 
  - [Stripe](https://mobbin.com/screens/ced08fbe-5237-45aa-95b4-d23785e59e4e): Create a subscription: inputs on the left, a live Summary with dated consequences on the right.
  - [Zillow](https://mobbin.com/screens/729c5e01-38db-440b-a6cc-1b5ee4299140): Add tenants dialog is three inputs (lease term, start, tenant). Keep the field count this small.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:107-121`
- **Verification:** partly. The observation is accurate, but this is a refinement of sheets that don't exist yet (G2C-004/005), so medium overstates it. The Stripe pattern is real: Stripe bab2a73a and 155c822d show Create a subscription with a Preview > Summary pane ('5 December 2024 · Subscription starts', 'First invoice'). For a three-field action, though, a permanent right-hand Summary pane at desktop adds chrome. The recommendation's own phone treatment (one consequence line under the fields plus a confirm button that restates the count) gives the same safety at every size. Fold this into G2C-004/005 rather than tracking it separately.

### G2C-I04

**Give each turn a Ready by date and show slips the way Flighty shows a delay**

Low · New capability · effort M · `Unit sheet, Units table Next column and listing Available date` · Rentals, residents and the public site run one lifecycle

- **Today:** The listing already has an Available date field (empty for 767), which is the natural rent-ready target. The overdue Aug 28 to Sep 24 tasks are rehab tasks at a property in Rehabbing status. Separately, the property Tasks card renders overdue dates in muted gray (page.tsx:197-199), while /tasks marks them red (task-row.tsx:106,238).
- **Why:** Vacancy cost comes from slipped turns. Flighty states a change in one line ('Departure changed to 10:15 AM. Flight now departs 1h 20m later') and strikes through the scheduled time with the new one beneath. The planned and the actual dates stay visible together.
- **Change:** Add Ready by to the turn. Record notice sets it to move-out plus 14 days, and it stays editable. The listing's Available date follows Ready by unless overridden. When Ready by moves, the unit sheet shows one line, 'Ready date moved to Nov 22, 7 days later', and the Units table's Next cell shows Nov 15 struck through above Nov 22. Red appears only once the date passes.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: the Next cell stacks the struck and new dates. Phone 375: the row's second line reads 'Ready Nov 22 · 7 days late' and drops the struck date.
- **Reuse:** Turn fields on the Tenancy or turn record from G2C-002; fmtDay; Badge red only for late.
- **References:** 
  - [Flighty](https://mobbin.com/screens/09e08a95-1063-4e78-baeb-a68dddb6136a): One-line change banner: 'Departure changed to 10:15 AM · Flight now departs 1h 20m later'.
  - [Flighty](https://mobbin.com/screens/735a1c2a-4ed9-48c1-9ddb-b4d1ca513432): Scheduled time struck through, the new time in red beneath, and one plain status line per row.
  - [Flighty](https://mobbin.com/screens/b8a92b60-b6d2-4d5c-99e3-cc311a24118d): Chained legs each marked On Time or Late, the same chain as move-out, turn, listed and move-in.
- **Code:** `prisma/schema.prisma:305`
- **Verification:** partly. Adding a 'Ready by' date next to the listing's existing Available date gives two dates that are almost always the same. Use Available as the single rent-ready target and show slips against it. Flighty 735a1c2a came back exactly in my search (struck scheduled time over a red new time), so the reference is real. The 'gray overdue dates' part is a separate, real bug that needs no new field. I filed it as G2C-V06.

### G2C-I07

**Turn each item that got worse into a turn task with one tap**

Low · New capability · effort S · `Move-out walkthrough result (G2C-I06)` · Rentals, residents and the public site run one lifecycle

- **Migration branch:** Rebuilt on the migration branch; this describes the branch. Still blocked on G2C-I06 (no walkthrough). The plan's D28 playbooks now stand in for a turn, so the target of 'Add to turn' changes.
- **Today:** The branch still has no move-out walkthrough or walkthrough result. The turn now exists as the 'NEW MOVE OUT' playbook under /templates. Apply playbook takes a Property and a tenant name (no unit) and creates 5 flat tasks: 'Perform unit walk through with [tenant] and receive keys', 'Create list of all deductions from [tenant] security deposit', 'Clean & Paint [tenant] unit', 'Return security deposit to [tenant]' and 'End lease in Baselane for [tenant]'. Nothing groups them as one turn. The property Tasks card now has 'Apply playbook' next to '+ Task'.
- **Why:** Data entered once should flow forward (Gusto's principle). Jobber puts the next lifecycle step on the record as its primary button ('Convert to Quote') and carries photos along. Here a walkthrough finding becomes work for a contractor without retyping it.
- **Change:** Point 'Add to turn' at the playbook's tasks. Each worsened row creates a task at that property and unit ('Kitchen floor: repair', move-out photo attached), due before the open 'Return security deposit to [tenant]' task, and a footer button 'Add all 4' does the same for every row. Apply playbook needs a Unit field for this (apply-flow.tsx has only Property and tenant), so the turn's tasks carry the unit.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a text button at the end of each row and the footer button below. Phone 375: the button sits under each row's photos, the footer button is pinned, and there are no swipe-only actions.
- **Reuse:** createTask in src/lib/tasks/service.ts; TaskAttachment for the photo; turn grouping from G2C-I03.
- **References:** 
  - [Jobber](https://mobbin.com/screens/fd3c5053-9fe6-42f0-9ea5-a5e1e1ef2df3): Primary buttons are the next lifecycle step (Schedule Assessment, Convert to Quote), and notes have a camera button.
  - [Jobber](https://mobbin.com/screens/ec35196c-2dda-41cb-838a-62a85f402ec9): Request photos ('1 of 10 uploaded') travel with the request into the job.
- **Code:** `src/app/(app)/properties/[id]/page.tsx:167-206`, `branch src/app/(app)/properties/[id]/page.tsx:182-189`, `asana-migration-plan.md D28`
- **Verification:** partly. This is a sub-feature of G2C-I06's result screen and can't exist before it, so it belongs inside I06 and doesn't need its own row. Effort S only holds once I06 and I03's turn grouping are built.

### G2C-I10

**Turn the move-in checklist into the tenant's own dated timeline**

Low · New capability · effort M · `Tenant's personal move-in page (link from G2C-005; fallback /residents/moving-in)` · Rentals, residents and the public site run one lifecycle

- **Today:** /residents/moving-in shows six identical cards with relative timings ('Due before move-in', 'Do this ASAP', 'Before move-in', 'Day of move-in', 'Within 2 days after move-in', 'Ongoing'). There are no dates and no names, and the cards never change. Tenants are told to 'text us once it's done' and 'Email us a copy of your policy', and nothing shows them what HG has already received.
- **Why:** Wise tells you where a transfer stands in you and we sentences with timestamps ('You set up your transfer', 'We received your SGD'), with the current step in bold. A tenant on a personal link should see the same: what's done, what's next and by when. That replaces texts asking 'did you get it?'.
- **Change:** On the personal link, replace the six cards with a vertical timeline built from the lease start: 'Nov 2 · You signed your lease', 'Nov 5 · We received your deposit', then in bold 'Set up gas and electric by Nov 28', then hollow 'Dec 1, morning · We drop off your keys' and 'Dec 3 · Your move-in report is due'. Each check HG ticks in the unit sheet (G2C-I11) flips here. The generic page stays as the fallback for anyone without a link.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: dates in a left column in Geist Mono with the step text beside them. Phone 375: the date sits above each step's text in one column. The public palette (near-black, off-white, gold) is unchanged.
- **Reuse:** CHECKLIST copy in src/app/(marketing)/residents/moving-in/page.tsx; the vertical timeline from G2C-I03, restyled for the public tokens.
- **References:** 
  - [Wise](https://mobbin.com/screens/ea2fde3e-8b3e-4ef8-92d9-ea5dc9e51fda): Updates timeline in you and we sentences with dates, the current step bold, and an action button under it.
  - [Brex](https://mobbin.com/screens/fdf16c74-5c67-4189-9ffb-4d2b83819811): Future step drawn hollow with its expected date.
  - [Gusto](https://mobbin.com/flows/9af21f74-3a74-4d67-b032-a9016f36cf81): The setup timeline shows each step's state: Completed on [date], Pending action, or By [date].
  - [Airbnb](https://mobbin.com/flows/ac0a721e-274d-4b18-97eb-403b4c59b394): The host welcome names the one blocking item ("Account info is needed · Required to get paid") above Your next steps.
- **Code:** `src/app/(marketing)/residents/moving-in/page.tsx:14-76`, `src/app/(marketing)/residents/moving-in/page.tsx:14-70`
- **Also found as:** JOURNEYS-I16 (Lens: the core jobs, end to end)
- **Verification:** partly. The observation is accurate (moving-in/page.tsx:14-76, six static cards with relative timings). For a handful of move-ins a year, a personal tokenized page is a new public surface that shows a tenant's name, address and dates. It needs unguessable, expiring links, and it duplicates I11's checks. Medium overstates it. Sending dated steps in the existing text thread gets most of the value for this volume.

### G2C-I13

**Let a recorded notice be withdrawn, undoing the steps it created**

Low · New capability · effort S · `Unit sheet header (on notice)` · Rentals, residents and the public site run one lifecycle

- **Today:** G2C-004 has a notice draft the listing and create MOVE OUT steps, but there's no way back when a tenant changes their mind. Today the only listing removal is 'Remove listing', which deletes its photos on Save with no confirm or undo (G2C-006).
- **Why:** Stripe keeps a reversible action beside the original in the record header ('Cancel refund' next to 'Refund'). Brex ends a pending request with 'Cancel budget request', and Linear confirms with an Undo toast. A withdrawn notice is common enough to deserve one button.
- **Change:** While a notice is open and move-out hasn't passed, the unit sheet header shows 'Withdraw notice'. It moves the open MOVE OUT steps to Canceled (kept in history), returns the listing to Draft with its photos intact, and clears the move-out date. A toast reads 'Notice withdrawn · Undo' for 8 seconds. History records 'Notice withdrawn · Nov 4'.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: a secondary button in the sheet header. Phone 375: an item in the header's … menu, with the toast above the bottom bar.
- **Reuse:** Canceled from the seven settled task statuses; new toast on React Aria (toast is a Known gap in docs/components.md).
- **References:** 
  - [Stripe](https://mobbin.com/screens/ebf7e9fe-326a-4459-ae16-f94aea16f56b): 'Cancel refund' sits next to 'Refund' in the payment header while the refund is pending.
  - [Brex](https://mobbin.com/screens/ecf850cc-08cc-46ef-b321-8248107afc9e): 'Cancel budget request' at the foot of a pending request's status timeline.
  - [Linear Mobile](https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3): 'Notification snoozed · Undo' toast.
- **Code:** `src/app/(app)/properties/[id]/edit-listings.tsx:304-306`
- **Verification:** partly. This depends on G2C-004. 'Remove listing' does delete photo blobs on save (service.ts:286-321), which supports the context. A withdrawn notice is rare at about 25 units, so put 'Withdraw notice' in the unit sheet's … menu at every size rather than as a header button. The Undo toast is fine (Toast is a Known gap).

### G2C-I14

**Add move-out and move-in day rows to Home, written person first**

Low · Design change · effort S · `Home (D10 'what needs me')` · Home and Today become one work queue

- **Today:** Home on a phone opens with 'Good morning, Connor', 'What needs attention', three counts (13 Active deals, 11 Properties, 193 Open tasks) and the 5-year CapEx forecast. Nothing says someone moves out or in today or tomorrow. G2C-010's rows cover lease ending, on notice and vacant, but not the move days themselves.
- **Why:** Airbnb's Today makes the day's arrivals the first thing a host sees, written around the person ('Sandra's group of 3 checks in' at 3:00 PM). Move days are when the lockbox code, the walkthrough and the keys all matter.
- **Change:** On move days, show a Today row such as 'Dana moves out today · 767 Prospect, Lower Front', with the masked lockbox code (tap to reveal) and 'Start walkthrough'. Another reads 'Sam moves in tomorrow · keys at 9am', with any open check from G2C-I11. An Upcoming view lists the next 14 days. A row clears when its walkthrough or key handover is done.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: one row in the Today list with a trailing action. Phone 375: a two-line row with the action as a trailing button and the code reveal as a tap.
- **Reuse:** Home rows from G2C-010; lockbox reveal from G2C-V03; the segmented control for Today / Upcoming.
- **References:** 
  - [Airbnb](https://mobbin.com/screens/a712767b-113c-4ead-875d-40a5fa2f9830): Today tab with a time, the guest's name and 'checks in', under a Today / Upcoming switch.
  - [Airbnb](https://mobbin.com/screens/d6c816b7-1b6e-4165-ba7f-f1ba5033ce32): Today / Upcoming with a one-sentence empty state.
- **Verification:** partly. The move-in-day row duplicates G2C-I11's Home row for the same event. The only new part is the move-out-day row. A Today | Upcoming switch on Home and a lockbox reveal on Home add chrome for an event that happens a few times a year, and they put a door code on the busiest screen. Fold one move-out row into G2C-010's row set instead.

### G2C-I15

**Close the turn on first rent: 'First rent $1,200 expected around Dec 1'**

Low · New capability · effort M · `Unit sheet turnover strip, last step` · Rentals, residents and the public site run one lifecycle

- **Today:** Rent is collected in Baselane, the QuickBooks mirror sums by property class (not unit), and the rent roll states 'No lease data yet'. Matching one unit's first payment by amount inside a multi-unit class is unreliable, and 767 Prospect has no class mapped ('No QuickBooks class is mapped to this property yet.').
- **Why:** A turn isn't finished when keys change hands; it's finished when rent lands. Copilot states each recurring item as an amount 'Expected around Sep 3rd' and checks it off when it posts. Late shows against that expectation instead of being noticed weeks later.
- **Change:** After Start tenancy, the strip's last step reads 'First rent · $1,200 expected around Dec 1'. When a deposit of that amount lands in the property's QuickBooks class within 5 days, offer 'Matches $1,200 on Dec 2 · Confirm'. Otherwise offer one tap, 'Mark received'. Five days past the date it turns red: 'First rent 4 days late'. Confirming closes the turn.
- **Desktop, tablet, phone:** Desktop 1280 and tablet 768: text on the strip's last step, with the Confirm button in the sheet. Phone 375: the same text on the vertical strip's last row, with Confirm as a trailing button.
- **Reuse:** LedgerLine and QboClass mapping (prisma/schema.prisma); fmtMoney; strip from G2C-I03.
- **References:** 
  - [Copilot](https://mobbin.com/screens/b8ee0b14-088d-407e-88ee-627b31d1bd7e): 'Next payment $20.00 · Expected around Sep 3rd' with a dashed future point.
  - [Copilot](https://mobbin.com/screens/b4297200-6207-407b-a4b6-53ce337d9c5e): Paid items get a check in place; 'left to pay' vs 'paid so far' at the top.
- **Code:** `src/app/(app)/properties/[id]/financials.tsx`
- **Verification:** partly. Keep the expected-date line and a one-tap 'Mark received'. Drop the automatic QuickBooks matching.

### G2C-I16

**Open the Units view with three tiles that filter: On notice, Vacant, Lease ends in 90 days**

Low · Design change · effort S · `Portfolio Units view (G2C-014)` · Rentals, residents and the public site run one lifecycle

- **Today:** The Portfolio Units column is a bare count (verified in portfolio aria). But the tile numbers (on notice, vacant, lease ending) need lease and notice data the app doesn't store, so none of them can be computed today.
- **Why:** Mercury opens Bill Pay with three tiles (Total outstanding, Overdue, Due in next 7 days), each a count plus money, and Stripe's status tiles filter the list beneath. The answer comes before the rows.
- **Change:** Above the Units view, show three tiles: 'On notice 2 · $2,350/mo', 'Vacant 1 · $1,200/mo', 'Lease ends in 90 days · 4'. Clicking a tile filters the table, and the selected tile shows only an underline. There's no Occupied tile, since that's the quiet default. Money is in Geist Mono.
- **Desktop, tablet, phone:** Desktop 1280: three tiles across. Tablet 768: three across, compressed. Phone 375: the tiles become a segmented control of counts ('Notice 2 · Vacant 1 · Ending 4') and the money drops.
- **Reuse:** Kpi from src/app/(app)/financials/_components/ui.tsx (move to src/components first); the segmented control from src/app/(app)/deals/filters.tsx for phone.
- **References:** 
  - [Mercury](https://mobbin.com/screens/d989795f-1f53-4ea4-9f9e-bf05ab5fa6ca): Count-plus-money tiles above the tabs, with color only on Overdue.
  - [Stripe](https://mobbin.com/screens/e0c8673e-3c63-4a81-895c-e6a71cf5c7c6): Status tiles (Active, Scheduled, Cancelled) act as filters above Subscriptions.
- **Code:** `src/app/(app)/properties/page.tsx`
- **Verification:** partly. This conflicts with the 'One switch per job' house rule, but conflicts_with is empty. Filters inside a page use the segmented control. Tiles that filter with an underline are a third switch style, and they turn into a segmented control at phone width. Use the segmented control with counts at all sizes, or keep the tiles as plain summaries that don't filter. The Kpi reuse path checks out (financials/_components/ui.tsx:15).
