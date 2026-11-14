# Tenants and leases

Planned with Connor on Nov 14, 2026, one question at a time (T1 to T9 below). It merges [tenant-contact.md](tenant-contact.md), which another session planned with him the same day (Q1 to Q26): that spec's rules for what a contractor sees at an occupied home are kept as written, and its data model (a tenancy stored in the unit's JSON) is replaced by tenant and lease records. Connor said "merge here" on Nov 14, so this file is now the one spec for tenants; `tenant-contact.md` stays as the decision log.

Nothing here gets built until Connor says "build it" in chat. It also builds only after branch `design-calls-nov14` is on main (Q15), since that branch changes the portal job page and `properties/service.ts`.

## 1. Summary

**Why.** HG Capital has no record of its tenants. Their names, numbers and rent live in signed leases, in Baselane, and in task text such as a move-in report. Connor wants every tenant in the app, current and past, with what each one pays or paid, their contact info and their move dates, and he wants a contractor at an occupied home to know who they're dealing with.

**What changes.**

- A **Tenants** list of its own in the sidebar, under Portfolio, with Current, Past and All (T6).
- Each property gets a **Tenants** section under Units & access: one row per unit with everyone living there, the rent and when the lease ends, then its past tenants (T5).
- A **lease page** per household: everyone on the lease with their contact info, the rent with its Section 8 split, the deposit, each signed term with its PDF, the move dates and notes (T3, T7).
- Every person who lives in a unit is a tenant on its lease, and one is marked **primary** (T2, Q25).
- **The import** brings in every current and past tenant from Connor's Baselane export and the signed lease PDFs, after he checks the list (T4).
- **Contractors** at an occupied home see the tenants, and the lockbox only with permission to enter, exactly as `tenant-contact.md` sections 3 and 4 say (Q21 to Q26, T8).
- **Playbooks**: applying New Tenant creates the upcoming lease, and applying Move Out sets the move-out date (Q24, adapted).

## 2. Decisions

**From this round (Nov 14):**

| # | Decision |
|---|---|
| T1 | Tenants are records with their own list, not a field on the unit. Past tenants are kept. Supersedes Q1 and Q23's "lease terms stay in Baselane" |
| T2 | Everyone who lives in a unit is on its lease, and one tenant is the primary. Matches Q25 |
| T3 | Option B, the useful extras. Each tenant: name, phone, email, emergency contact. Each lease: everyone on it, rent with the Section 8 split, deposit, each signed term, move-in and move-out, the signed PDF, notes. No date of birth, ID numbers, income or employer |
| T4 | The import reads Connor's Baselane export and the signed leases. Connor checks the list before anything is saved |
| T5 | Option A on the property page: a Tenants section under Units & access, one row per unit, past tenants below |
| T6 | Tenants gets its own sidebar item under Portfolio, and the property page shows each property's tenants too. The list can be filtered by property |
| T7 | Option A: a click on a tenant opens the lease page for the household, from the list and from the property alike |
| T8 | Keep all five of the other session's calls: permission ends when a new household moves in; changing a job's unit or property clears it; changing the contractor keeps it; a repeat starts without it; Move Out sets the date for everyone on the lease |

**Kept from `tenant-contact.md`:** Q2, Q3, Q5, Q9, Q10, Q12, Q13, Q14 as updated by Q26, Q19, Q21, Q22, Q25, Q26, and Q24 with its saves made to leases (section 9). **Superseded here:** Q1 and Q17 (tenants live in leases, not in the Units editor), Q8 (staff add tenants from the property's Tenants section or New lease), Q23's dates move from the unit to the lease, and Q11's prefill reads the lease.

**Calls made in this spec, for Connor to check before "build it":**

1. A rent change at renewal is a new **term** inside the same lease, each with its own dates, rent and PDF. The lease is the household's stay; its terms are the leases they signed. So "what they were paying" keeps every rent, and a renewal doesn't look like a move.
2. A tenant's phone is optional. Leases often name a co-tenant with no number, and the import shouldn't drop them. The contractor sees a tenant without a phone by name only, with no icons. (Q25 had made both required.)
3. Up to 10 tenants on a lease.
4. Tenants show in global search (⌘K) by name, phone and email, and open their lease.
5. The Units editor doesn't get the tenant fields `tenant-contact.md` section 5 drew. Tenants are added from the property's Tenants section or New lease.
6. A unit with current or upcoming tenants can't be deleted: "Front has current tenants. End their lease first."

## 3. Data

Three tables and a file table, all new. Money follows `Property` (`Decimal(12,2)`), and dates follow `Task.dueDate` (UTC midnight, read as a Buffalo day).

```prisma
// A person who lives, or lived, in one of HG Capital's units.
model Tenant {
  id             String   @id @default(cuid())
  fullName       String
  phone          String?  // as shown: "716-555-1234 ext 2"
  phoneE164      String?  // what Call and Text dial, from readPhone
  email          String?
  emergencyName  String?
  emergencyPhone String?
  notes          String?  @db.Text
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  leases         LeaseTenant[]

  @@index([fullName])
}

// One household's stay in one unit: from moving in to moving out.
model Lease {
  id         String    @id @default(cuid())
  property   Property  @relation(fields: [propertyId], references: [id], onDelete: Restrict)
  propertyId String
  unitId     String?   // the unit's id in Property.units; null on a property with no units
  unitLabel  String?   // the unit's label, kept current by writeUnits (renames follow unitId)
  movesIn    DateTime? // null: they live there now (an import with no date)
  movesOut   DateTime? // the day they leave; null until they give notice
  deposit    Decimal?  @db.Decimal(12, 2)
  notes      String?   @db.Text
  source     LeaseSource @default(APP)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  createdByUserId String?
  tenants    LeaseTenant[]
  terms      LeaseTerm[]
  files      LeaseFile[]

  @@index([propertyId, unitId])
}

model LeaseTenant {
  lease    Lease   @relation(fields: [leaseId], references: [id], onDelete: Cascade)
  leaseId  String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  tenantId String
  primary  Boolean @default(false)
  position Int     // the order staff entered them; the primary shows first

  @@id([leaseId, tenantId])
}

// A signed lease: its dates and rent. Renewing adds a term.
model LeaseTerm {
  id       String    @id @default(cuid())
  lease    Lease     @relation(fields: [leaseId], references: [id], onDelete: Cascade)
  leaseId  String
  startsOn DateTime
  endsOn   DateTime? // null: month to month
  rent     Decimal   @db.Decimal(12, 2) // the whole monthly rent
  subsidy  Decimal?  @db.Decimal(12, 2) // the housing authority's share (Section 8); the tenant pays rent minus this
  subsidyFrom String? // "Buffalo Municipal Housing Authority"
  file     LeaseFile? @relation(fields: [fileId], references: [id], onDelete: SetNull)
  fileId   String?   @unique

  @@index([leaseId, startsOn])
}

// The signed PDFs, stored like PropertyAttachment (private Blob).
model LeaseFile {
  id               String   @id @default(cuid())
  lease            Lease    @relation(fields: [leaseId], references: [id], onDelete: Cascade)
  leaseId          String
  url              String
  pathname         String
  filename         String
  size             Int
  contentType      String?
  createdAt        DateTime @default(now())
  uploadedByUserId String?
  term             LeaseTerm?
}

enum LeaseSource {
  APP
  IMPORT
  PLAYBOOK
}
```

`Task` gains `entryPermittedAt DateTime?` and `SecurityEventKind` gains `TENANT_VIEWED`, exactly as `tenant-contact.md` section 2 says. One migration adds all of it. It's additive, and its `TENANT_VIEWED` line follows that section's note about Postgres enum values (55P04).

**Rules, in one service** (`src/lib/tenants/service.ts`, the only writer, per the README's rule that services own writes):

- Every lease has at least one tenant and exactly one primary. Removing the primary makes the next tenant primary; the last tenant can't be removed ("A lease needs at least one tenant. Delete the lease instead.").
- A tenant's name is required; the phone goes through `readPhone` from `src/lib/contractors/contact-fields.ts`, which also writes `phoneE164`, so it reads and dials like a contractor's (`PHONE_INVALID` on a number it can't read).
- `movesOut` comes after `movesIn` ("Move-out comes after move-in."). A term ends after it starts. Terms on one lease don't overlap.
- Two leases on one unit can't both be living there on the same day ("Another lease covers Mar 2025 at Front."). An upcoming lease may start the day the current one moves out.
- `subsidy` is at most `rent`.
- A tenant can be on more than one lease (moved units, or came back), and their contact info is the same record on each.

**Status, from dates alone** (`leaseStatus(lease, today)` in `src/lib/tenants/status.ts`, pure, with the Buffalo day):

```
past      = movesOut set and movesOut <= today
upcoming  = movesIn set and movesIn > today
current   = otherwise
```

**Who lives there today** replaces `tenant-contact.md`'s `livingThere(unit, today)`: `livingLease(leases, unitId, today)` returns the unit's current lease or null. Everything in that spec that read the unit's tenancy reads this instead: `accessState`, the task page's Tenants row, the job page, the playbook prefill. Its rule for a property with no unit picked (Q9) is unchanged: a single-unit property uses its one unit (house-meter rows don't count), and a multi-unit building shows no tenants.

**Rent today**: the term whose `startsOn` is on or before today and whose `endsOn` is blank or on or after today. After the last term ends with nobody moving out, the lease reads "Month to month since Feb 28, 2027" and the last term's rent stands.

**Units.** `writeUnits` in `src/lib/properties/service.ts` (the one write to the units list) gains two steps inside its transaction: a rename updates `Lease.unitLabel` where `unitId` matches, as `renameTaskUnits` does for tasks, and a delete is refused while the unit has a current or upcoming lease (call 6). Units that predate unit ids have none until their property's next units save, and the pickers name them by a placeholder (`unit-at-<index>`). So creating a lease runs that save's id step first (`ensureUnitIds` in `src/lib/tenants/core.ts`): every unit on the property gets a lasting id, nothing else in the list changes, and a placeholder pick turns into its unit's new id. It bumps the property's `updatedAt` on purpose, so an editor still holding placeholders is refused and reloads instead of giving the units new ids under a lease. The import does the same (section 10).

## 4. The Tenants list

![The Tenants list at laptop and phone](tenants/01-list.svg)

A new route, `src/app/(app)/tenants/(list)/page.tsx`, beside Contractors' and built the same way.

- **Sidebar:** "Tenants" with lucide `Users`, right under Portfolio in `src/components/nav.tsx`, with `list: "tenants"` so the link remembers its filters (`src/lib/list-memory.ts`). The phone drawer gets it in the same place. Global search's Go list (`src/lib/commands.ts`) gets "Tenants".
- **The bar** (`FilterBar` in a `FilterScope list="tenants"`): search (name, phone, email, address, unit), views **Current**, **Past** and **All** (a segmented control, Current by default), and a **Property** facet. Sort: Home (the default, street order then unit), Name, Rent, Lease ends.
- **Rows: one per tenant**, so everyone in a unit shows. Columns: **Name** (the primary has no badge here; the lease page says it), **Home** ("647 Prospect · Front"), **Rent** (the whole rent, on the primary's row only; the others show "—" in `--fg-3`), **Lease ends** ("Feb 2027", "Monthly", or in Past "Moved out Aug 2026") and **Phone** (`num`, `--fg-2`). A row opens its lease (`TaskRow`-style whole-row link).
- **New lease** is the header's button, as New contractor is on Contractors.
- **Empty states:** Current with no tenants reads "No current tenants yet." with New lease; a search with nothing reads as Contractors' does.
- **Sizes.** Laptop 1280: every column. Tablet 768 (touch): Phone drops, rows 48px. Phone 375: each row is the name over the home, with the rent on the right; Lease ends and Phone drop. Phone 320: the same, the home truncates. The bar collapses into its Filters button as Contractors' does.

## 5. The property's Tenants section

![The property page's Tenants section](tenants/02-property.svg)

A new `TenantsSection` in `src/app/(app)/properties/[id]/`, right under `UnitsSection` in the main column.

- **One row per rentable unit**, in the units' order (house-meter rows skipped; a property with no units gets one row, "Home"). Columns: **Unit**, **Tenants** (the primary first, everyone else after, comma-joined, truncating), **Rent** and **Lease ends**. A row opens the lease.
- **A vacant unit** reads "Vacant" in `--fg-3` with an **Add tenants** verb (`RailVerb`-style), which opens New lease with the property and unit picked.
- **An upcoming lease** shows as a meta line under its unit: "Next: Ana Ruiz from Feb 1". On a vacant unit it takes the row instead: "Ana Ruiz · moves in Feb 1".
- **Past tenants (6)** is a ghost button under the rows that opens the list in place: one line per past lease, newest first, "Amy Chen, Bo Chen · Front · Mar 2023 to Feb 2025 · $1,750", each opening its lease. It stays open for the visit.
- The section's own header link "All tenants" opens the Tenants list filtered to this property.
- **Sizes.** Laptop 1280 and tablet 768: the four columns. Phone 375 and 320: each row is the unit and rent on one line, the names under it; Lease ends moves to the lease page.

## 6. The lease page

![The lease page at laptop and phone](tenants/03-lease.svg)

`src/app/(app)/tenants/[id]/page.tsx`, where the id is the lease's. A record page on the task page's grid: main column and a 320px Details rail from lg, a chip row below that.

- **Header:** the back link "Tenants", a status mark (Current, Upcoming or Past, from `leaseStatus`, using `StatusMark`'s ring family: Upcoming the clock, Current the half ring, Past the slashed ring) and the title "647 Prospect · Front", whose address links to the property. The ⋯ menu: Copy link, and Delete lease (confirm: "Delete this lease? Its tenants stay in the app, but this stay, its terms and its files go for good.").
- **Tenants** section: one row per person, the primary first with a "Primary" tag (`tagClass`). Each row: the name over the phone and email as meta, and the emergency contact as a second meta line when set. Call, Text (touch only, Q13) and Email icon links on the right, as on a contractor's record. A click on the row opens the person's sheet (`FormSheet`): name, phone, email, emergency contact, notes, "Make primary", "Remove from lease". **Add tenant** under the rows opens the same sheet empty, or lets staff pick someone already in the app.
- **Terms** section: one row per term, newest first: "Mar 1, 2026 to Feb 28, 2027 · $1,900", with "Tenant pays $400 · Housing authority $1,500" under it when there's a subsidy, and the signed PDF as a file link on the right (the files list's row). **Renew** adds a term starting the day after the last one ends, prefilled with its rent.
- **Notes**: `InlineField` multiline, as on the task page.
- **Earlier at this unit**: the unit's other leases, one line each as on the property page.
- **The Details rail:** Property, Unit, Moved in, Moves out ("Leave blank until they give notice"), Rent, Tenant pays, Housing authority, Deposit and Term ends, each an `InlineField` fact that saves at once with a toast and Undo. Rent, the split and Term ends edit the current term.
- **Moving out**: setting Moves out on a current lease reads in the toast "Dana Lee and Sam Lee move out Jan 31" and the unit turns vacant for contractors that day.
- **Sizes.** Laptop 1280: the rail on the right. Tablet 768 and phones: the facts become the chip row under the title, as on the task page, and the sections stack. Phone 320: the chip row scrolls sideways.

## 7. New lease

`src/app/(app)/tenants/new/page.tsx`, a page like New contractor, opened from the list's button, a vacant unit's Add tenants, or the property's section.

- **Where:** Property and Unit pickers (`PropertyPicker`, `UnitPicker`), prefilled from the link.
- **Tenants:** one row per person (name, phone, email), the first one primary, **Add another tenant** up to 10, each row removable. Typing a name offers people already in the app (a returning tenant).
- **Dates:** Moves in, then the first term's Starts and Ends, with **Month to month** leaving Ends blank.
- **Money:** Rent, **Housing authority pays (optional)** with who pays it, and Deposit.
- **Signed lease:** an optional PDF, through the upload queue as documents are.
- **Save** lands on the new lease page with a toast that names what's next: "Lease saved. Dana Lee shows on jobs at Front from Feb 1."
- **Sizes.** Laptop 1280 and tablet 768: pairs of fields side by side, as New contractor lays them out. Phones: stacked.

## 8. Tasks and the job page

Exactly `tenant-contact.md` sections 3 and 4, with two changes:

- **The source.** The task page's Tenants row and the job page read `livingLease`'s tenants. The rail's "Edit on the property" becomes **Open lease**, to the lease page.
- **No phone** (call 2): a tenant without a number shows by name only, with no icons, on both pages.

The Access row, Permission to enter, the status lines, the ACCESS events and the `#access` anchor in job emails are unchanged. The five calls in T8 hold. Today's Lockbox row ("2374 · Shown to Brandon", built Nov 14) becomes that Access row, and keeps showing the code to staff.

## 9. Playbooks

`tenant-contact.md` section 6, with the saves going to leases:

- **The prefill** reads the unit's current lease: `[Tenant]` gets the names joined, the phone fill-ins the primary's phone. A move-in playbook prefills nothing.
- **Move-in playbook:** the checkbox, ticked by default, reads "Create a lease for Dana Lee at Unit 2, moving in Feb 1". Apply creates an upcoming lease (`source: PLAYBOOK`) with that one tenant, the playbook's date as Moves in, and no term yet. The lease page asks for the rest ("Add the signed lease to record the rent.").
- **Move-out playbook:** "Set Dana Lee and Sam Ortiz to move out Jan 31" sets the current lease's Moves out (T8: everyone on it).
- Both write through the tenants service in Apply's one transaction, so a refused save creates no tasks.

## 10. The import

A one-time script, `scripts/migrate/04-tenants.ts`, beside the other migrations, run in three steps.

1. **Connor drops the files** in `_private/tenants/` (gitignored): Baselane's tenant or lease export (CSV or Excel; screenshots work if there isn't one) and the signed lease PDFs, old ones included.
2. **The build reads them into one review file**, `_private/tenants/review.csv`: one row per person per lease, with the property, unit, primary, phone, email, move dates, each term's dates and rent, the subsidy, the deposit and the PDF it came from. Baselane wins on contact info; the signed lease wins on names, dates and rent. Gaps and disagreements are flagged in a last column ("No phone", "Baselane says $1,850, lease says $1,900"). Connor checks it and fixes what's flagged.
3. **The script imports the checked file**, first as a dry run that prints what it would create, then for real against local and, with Connor's go-ahead, production. It's idempotent: it matches a lease by property, unit and move-in, and a tenant by name and phone, so a second run adds nothing. It first saves each touched property's units once so every unit has an id. PDFs upload to Blob as `LeaseFile`s. Every row is `source: IMPORT`.

## 11. Privacy

- Tenants, leases and files are staff-only: every route under `/tenants` and every action calls `requireUser`, and no portal file imports `src/lib/tenants`. `src/lib/auth-guard.test.ts` gains that check beside its `units` one.
- The portal reads tenants only through `access-code.ts`'s `readJobAccess`, as `tenant-contact.md` section 7 says: names and phones of the living lease's tenants for one job, never rent, deposit, email, emergency contacts, notes, files or any other lease.
- Lease PDFs are private Blob files served through a session-checked route, like property documents.
- Nothing is sent to tenants (Q5).

## 12. Files

| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, one migration |
| Tenants | `src/lib/tenants/service.ts`, `status.ts`, `queries.ts` and their tests; `src/app/(app)/tenants/(list)/page.tsx`, `filters.tsx`, `loading.tsx`, `query.ts`; `src/app/(app)/tenants/[id]/` (page, sections, actions, loading); `src/app/(app)/tenants/new/` |
| Navigation and search | `src/components/nav.tsx`, `src/lib/list-memory.ts`, `src/lib/commands.ts`, `src/lib/search.ts` and the search route |
| Property | `src/app/(app)/properties/[id]/page.tsx`, a new `tenants-section.tsx`, `src/lib/properties/service.ts` (`writeUnits`) |
| Access rules | everything in `tenant-contact.md` section 8's Rule, Portal and Task page rows, reading `livingLease` |
| Playbooks | as `tenant-contact.md` section 8, plus the tenants service |
| Import | `scripts/migrate/04-tenants.ts` |
| Devices | `tests/devices/routes.ts` (`SAMPLE_PARAMS` for `tenants/[id]`) |
| Docs | `docs/components.md` if `TenantsSection` or the person sheet turns general; `docs/specs/README.md` |

**Tests.** `leaseStatus` and `livingLease` across move dates, Buffalo midnight and back-to-back leases; rent today across terms and month to month; every service rule in section 3 with its message; `writeUnits` renaming a lease's unit and refusing a delete; the import matching a second run to nothing; the access tests of `tenant-contact.md` section 8 rewritten for leases; the auth guard.

**Checks.** `npm run typecheck`, `npm run lint`, `npm test` and the device check, plus by hand at 375 and 320: the list in each view, a property with a vacant unit and past tenants, a lease with three tenants and a subsidy, New lease, and the job page occupied, with permission and vacant.

## 13. Reuse check

| | What |
|---|---|
| **Reused** | `FilterScope`, `FilterBar` with views and a facet, `ResultLine`, `SortHeader`, list memory and the sidebar's `list` link (Contractors' list); `PropertyPicker`, `UnitPicker`; `InlineField` facts and notes; the record grid and Details rail (the task page); `Section`, `FormSheet`, `FormField`, `DateField`, `tagClass`, `StatusMark`, `ConfirmDialog`, `Menu`; the files list and private Blob uploads (property documents); `readPhone`, `telHref`, `textHref`; `Money` |
| **Extended** | `writeUnits` (lease labels, the delete refusal); global search (tenants); `auth-guard.test`; everything `tenant-contact.md` section 9 extends, reading leases |
| **New** | `Tenant`, `Lease`, `LeaseTenant`, `LeaseTerm`, `LeaseFile`; the tenants service, `leaseStatus`, `livingLease`; the Tenants list, `TenantsSection`, the lease page, New lease; the import script |

**References.** Mobbin has no landlord apps, so the list follows Contractors and the lease page follows the task page. Rent roll rows follow [Zillow's units table](https://mobbin.com/screens/62ef5ddd-0469-4cc8-bdaa-5eefe66dd0f8) (unit, then the money and the date per row). The contact rows and the job page keep `tenant-contact.md` section 9's references.

## 14. Build

After `design-calls-nov14` is on main and Connor says "build it". One package in its own worktree, in four steps, each checked before the next:

1. Schema, the tenants service and its rules, `writeUnits`, and the import script with a dry run on local data (Opus: data and migrations).
2. The Tenants list, the property's section, the lease page and New lease (Sonnet build, Opus review at every size).
3. The access rules from `tenant-contact.md`, reading leases (Sonnet build, Opus review on privacy).
4. Playbooks, then the import for real once Connor has checked `review.csv`.

About five hours of build and checks, plus Connor's time on the review file.

## 15. Build notes (Nov 14)

Part one (section 14's steps 1 and 2, and search) is built. What it decided inside the spec:

- **Tenant pays** shows in the lease page's rail only when a housing authority pays part; without one it would repeat the rent. The term rows still say both when there's a split.
- **Moved in** reads **Moves in** on an upcoming lease.
- **Signed leases upload per term**: each term row has "Add the signed lease", or the file with Replace, through a new `lease-upload` kind (one queue target per term, the lease's own Blob folder, staff only). A replaced file stays on the lease, unlinked.
- **Search** shows a tenant with the initials avatar contractors use, a "Past" tag on a past tenant, and their most relevant lease as the second line. Tenants aren't in Recent yet: `RecentKind` is a Postgres enum, so that waits for a migration.
- **New lease** doesn't yet offer someone already in the app as you type a name (the service takes `{ tenantId }`, so it's a UI add). The lease page's Add tenant is new people only, for the same reason.
- **The lease page's tab** reads the home ("647 Prospect Ave. · Front"), through a new `lease` record kind.
