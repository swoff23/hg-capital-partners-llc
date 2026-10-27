# Tenant contact on jobs

Planned with Connor on Oct 26, 2026, in three rounds of questions (Q1 to Q17 below), and he took every recommendation. Q18 is his answer (B) to the one question an Opus review of the draft raised. Nothing here gets built until Connor says "build it" in chat.

It builds after chunk 7 (activity and comments) lands. Chunks 6 and 7 are rewriting the same job page and its queries. Chunk 7 owns `lockbox.ts`, `core.ts`, `activity.ts`, `portal/queries.ts` and `portal/jobs.ts`, and may change `access-code.ts` to mask lockbox codes in comments. Chunk 6, not on main yet, moves lines cited here in `properties/actions.ts`, `properties/service.ts`, the property page and the task and job pages. So the build re-reads every file cited here once chunks 6 and 7 are on main.

## 1. Summary

**Why.** Many jobs are at an occupied home. HG gives the contractor the tenant's name and phone number, the lockbox code, or both. Today no unit holds a tenant: a unit stores its label, lockbox code, utilities and equipment (`src/lib/property-types.ts:21`). A tenant's name and number live only in task text, such as a move-in report (`src/app/(marketing)/residents/moving-in/actions.ts:103`), notes, or a playbook's `[Tenant]` and `[tenant number]` blanks. The assigned contractor sees the unit's lockbox code automatically on an open job, with no per-job choice (`src/lib/portal/access-code.ts`, `src/lib/portal/queries.ts:276`).

**What changes.**

- Each unit on a property can hold one tenant: a name and a phone number, next to its lockbox code (Q1, Q4).
- Each job shares the tenant, the lockbox code, or both, chosen on the task's Access row. By default a job shares the tenant when one is on file and the lockbox when not (Q6).
- Adding a tenant moves the unit's open jobs that follow the default and show a code to Both, so those contractors keep the code (Q18).
- The contractor sees the tenant on the job page as a Tenant section with Call and Text buttons, above the Lockbox section (Q3, Q14 B).
- The Tenant section follows the lockbox code's rules: only the assigned contractor, only while the job is open, logged when shown (Q2, Q12). Playbook fill-ins are the one exception, since Apply writes them into task text (section 7).
- Staff see the tenant on the task with Call and Text (Q10), and playbooks fill their tenant blanks from the unit (Q11).
- Nothing is sent to the tenant (Q5).

**Decisions, as Connor took them.**

| # | Decision |
|---|---|
| Q1 | The tenant lives on the unit, beside its lockbox code. A tenant and lease record can fill the same slot later |
| Q2 | Same rule as the lockbox code: only the assigned contractor, only while the job is open; gone once it's done or their access is removed. Staff always see it on the property |
| Q3 | Full name and number, with Call and Text buttons that dial the clean number, so a number with an extension still dials |
| Q4 | One contact per unit. A roommate or spouse goes in the unit's notes for now |
| Q5 | Nothing goes to the tenant in this round |
| Q6 | A per-job choice: Tenant, Lockbox or Both. The default is Tenant when a tenant is on file, Lockbox when not |
| Q7 | Occupied means a tenant is on file; there's no occupied or vacant switch. A job always shows the unit's current tenant, never a copy |
| Q8 | Staff enter it in the property's Units editor. The task's Access row links there when nothing is on file |
| Q9 | No unit picked: a single-unit home uses its tenant; a multi-unit building shows none, and the task page asks for a unit |
| Q10 | The task page shows the tenant with Call and Text for staff, and says what the contractor gets |
| Q11 | Applying a playbook fills `[Tenant]` and `[tenant number]` from the unit. Nothing is saved back yet |
| Q12 | A contractor opening a job that shows the tenant is logged, like the lockbox code |
| Q13 | Text shows on phones and tablets only, as on a contractor's record (ADMIN-004); with a mouse the number shows next to Call |
| Q14 | Layout B on the job page: a Tenant section with a Call and Text pair, above Lockbox |
| Q15 | Built right after chunk 7 lands |
| Q16 | The choice is a menu on the task's Access row |
| Q17 | The Units editor gets Tenant and Tenant phone under each unit's lockbox code, with Remove tenant, and Add tenant on a unit without one |
| Q18 | Adding a tenant to a unit switches its open jobs that have no stored choice and show a lockbox code to Both, so the contractor keeps the code and gets the tenant. A stored choice stays, and new jobs keep Q6's default |

## 2. Data

**On the unit.** `PropertyUnit` gains three optional fields, flat like `lockboxCode`:

```ts
tenantName?: string | null;      // "Jane Doe", trimmed; null when no tenant
tenantPhone?: string | null;     // as shown: "716-555-1234 ext 2"
tenantPhoneE164?: string | null; // what Call and Text dial: "+17165551234"
```

- **The save.** `unitSchema` in `src/app/(app)/properties/actions.ts:61` is a plain zod object, so it drops any key it doesn't name. It gains `tenantName` (max 120) and `tenantPhone` (max 40). `tenantPhoneE164` is never read from the client.
- `writeUnits` in `src/lib/properties/service.ts` (the one write to the units list) adds the three fields to its explicit clean map (`service.ts:362`) through a pure `readUnitTenant` in `property-types.ts`, since `service.ts` has no test file. The name is trimmed. The phone goes through `readPhone` from `src/lib/contractors/contact-fields.ts:85`, which also derives `tenantPhoneE164`, so a unit's number reads and dials the same way a contractor's does and the pair is always written together.
- Refusals come back as field errors, so the sheet's own fields draw them: a number `readPhone` can't read throws `new FieldError({ tenantPhone: PHONE_INVALID })` ("Enter the full number, like 716-555-1234."), a phone with no name throws `new FieldError({ tenantName: "Enter the tenant's name." })`, and a name with no phone throws `new FieldError({ tenantPhone: "Enter the tenant's phone number." })`. So a tenant is always a name and a number (Q3).
- A unit has a tenant when `tenantName` is set. That's what occupied means (Q7).
- Units are JSON, so this part needs no migration.
- Re-running `scripts/migrate/01-properties.ts` rewrites each property's units from the spreadsheet, which has no tenant columns, so it erases every tenant entered here. It writes the column directly, so it switches no jobs (Q18).

**On the task.** One new nullable column holds the per-job choice (Q6):

```prisma
enum AccessShare {
  TENANT
  LOCKBOX
  BOTH
}

model Task {
  // existing fields stay
  accessShare AccessShare? // null until staff pick: the default below decides
}
```

`createNextRepeat` (`src/lib/tasks/core.ts:509`) lists the fields it copies one by one, so it gains `accessShare` and the next repeat keeps the choice. Changing the job's unit, property or assignee keeps it too.

**What the contractor sees.** One pure function, `accessState`, decides it, beside `lockboxState` in `src/lib/tasks/lockbox.ts`. The staff task page calls it; in the portal only `access-code.ts` does (section 7):

```
tenant  = the job's unit's tenant; with no unit, the tenant of a single-unit property (Q9)
code    = resolveLockboxCode(units, unitLabel), unchanged
share   = accessShare ?? (tenant ? TENANT : LOCKBOX)
shows tenant  = tenant and share is TENANT or BOTH
shows lockbox = code and (share is LOCKBOX or BOTH, or share is TENANT and no tenant is on file)
```

The last clause is the move-out fallback (Q7): once staff remove a tenant, a job set to Tenant falls back to the lockbox. A single-unit property means one rentable unit, so the house-meter rows `isHouseMeterRow` finds don't count.

**Adding a tenant (Q18).** Under the default alone, adding a tenant would move a job with no stored choice from Lockbox to Tenant, and the contractor would lose the code mid-job. So when a save gives a unit a tenant it didn't have, `writeUnits` switches that unit's jobs in the same transaction. A pure `tenantsAdded(before, edited)` beside `readUnitTenant` in `property-types.ts` finds those units, matched by id. The switch runs on every save, before the early return at `service.ts:385` (most saves rename nothing, so a call placed after it would never run). It works from the units and labels as they were before the save, and any renames follow it. Its task ids join the renamed ones in `revalidateTasks`. It calls a new `shareTenantOnOpenJobs` in `core.ts` through `tasks/service.ts`, as it calls `renameTaskUnits` (`core.ts:767`) today. A job switches when all of these hold:

- it's at that unit, or has no unit on a single-unit property (Q9);
- it's active (`isActiveStatus`, Review included) with a contractor assigned;
- its `accessShare` is null;
- `resolveLockboxCode` finds a code for it in the units as they were before the save.

Each one goes through `patchTask`, as a rename does, with `accessShare` BOTH and `accessReason: "tenantAdded"`. `TaskPatch` gains that server-only `accessReason?: "tenantAdded"`, which `patchSchema` never accepts, and `patchTask` copies it into the INTERNAL ACCESS event's data (section 4), with no notify and no email. A job where staff stored a choice (Tenant, Lockbox or Both) keeps it. A job stored as Tenant that fell back to the lockbox while the unit was empty goes back to the tenant alone, since staff picked Tenant. Replacing one tenant with another switches nothing, since those jobs already default to Tenant. New jobs keep Q6's default.

**The security log.** `SecurityEventKind` gains `TENANT_VIEWED`. `noteJobViewed` (`src/lib/portal/jobs.ts:44`) takes `{ lockboxShown, tenantShown }` and hashes the IP when either is true. `logLockboxView` (`jobs.ts:77`) takes the kind as a parameter and reuses its once-a-day advisory lock, so each kind is logged once per contractor, job and Buffalo day.

**The migration**, one file, sorted after chunk 7's:

```sql
-- Tenant contact on jobs (docs/specs/tenant-contact.md). Additive: a new enum,
-- one nullable column, one enum value. Nothing is backfilled; a null
-- accessShare means "the default". No statement here may use TENANT_VIEWED:
-- Postgres can't use an enum value in the transaction that adds it (55P04),
-- as 20261023000000_task_status_values says. Roll forward only.
CREATE TYPE "AccessShare" AS ENUM ('TENANT', 'LOCKBOX', 'BOTH');
ALTER TABLE "Task" ADD COLUMN "accessShare" "AccessShare";
ALTER TYPE "SecurityEventKind" ADD VALUE 'TENANT_VIEWED';
```

## 3. The contractor's job page

A Tenant section above Lockbox (Q14 B), in `_components/job-details.tsx` beside `LockboxSection`. The name and number sit on one line; the Call and Text pair sits under it, built like `AddressActions` on the same page.

**Phone 375**

```
Tenant ─────────────────────────────
Jane Doe · 716-555-1234
[ (ph) Call      ] [ (txt) Text     ]

Lockbox ────────────────────────────
4521
```

**Phone 320.** The pair keeps half the row each, about 136px. A long name truncates before the number does:

```
Tenant ──────────────────────
Jennifer Montgo… · 716-555-1234
[ (ph) Call  ] [ (txt) Text  ]
```

**Tablet 768.** Touch layout: both buttons size to their labels at 44px and sit left.

**Laptop 1280.** Call sizes to its label and sits left. Text hides with a mouse (Q13), so the number stays in full on the line above.

- The name is `text-body` `--fg-1`, the number `num` `--fg-2`, joined by " · ". The name truncates (`min-w-0 truncate`) and the number doesn't shrink.
- The buttons are plain `<a href="tel:…">` and `<a href="sms:…">` styled with `buttonClass({ variant: "secondary" })`, since `LinkButton` is a Next `Link`. Icons are lucide `Phone` and `MessageSquareText` at the brand sizes. The labels read "Call" and "Text"; the `aria-label`s read "Call Jane" and "Text Jane". They dial `tenantPhoneE164` through `telHref` and `textHref` in `src/lib/contacts.ts`.
- **Both:** Tenant, then Lockbox. **Tenant only:** no Lockbox section. **Lockbox only:** the page as it is today.
- **Closed job, or access removed:** neither section shows (Q2).
- **My jobs** adds nothing: the Tenant section shows only on the job page.

## 4. The staff task page

Two rows in Details, in `tasks/[id]/fields.tsx`.

**Laptop 1280, rail**

```
Tenant     Jane Doe                 (ph)
           716-555-1234
Access     Tenant and lockbox ⌄
           Shown to Zack
```

**Phone 375, the chip row under the title**

```
[ (ph) Jane Doe ]  [ (key) Tenant and lockbox ⌄ ]  …
```

**Tenant row.** It shows whenever the job's unit (or a single-unit property) has a tenant, whether or not a contractor is assigned.

- In the rail: the name, with the number as a meta line under it, so a mouse user sees the number without hovering. The name truncates; the number stays whole. Then the Call and Text icon links as on a contractor's record (`src/app/(app)/contractors/[id]/contact-section.tsx:120` to `134`), with Text touch only.
- In the chip row: a chip with the name opens a `Menu` headed by `MenuHeader` (the name over the number), then "Call Jane", "Text Jane" and "Edit on the property". "Text Jane" is left out on a fine pointer through `useCoarsePointer`, not hidden with CSS, so a keyboard can't reach a hidden item.
- "Edit on the property" goes to `/properties/<id>?unit=<label>` (section 5).

**Access row.** It shows when a contractor is assigned on an active job with a property, as today's Lockbox row requires (`tasks/[id]/page.tsx:123`), and it replaces that row (`fields.tsx:254`). It now also shows with only a tenant, or with neither. Its chip opens a `Menu` with `selectionMode="single"`:

- **Tenant**, **Lockbox**, **Tenant and lockbox**. The chip reads the choice (the stored one, or the default) and the menu checks it.
- A choice whose part is missing is disabled with a description: "No tenant on file", "No lockbox code".
- The status line stays one line. It reads "Shown to Zack" when `accessState` shows the whole choice, and names what it shows when it doesn't: "Lockbox shown to Zack" (Tenant or Both after a move-out), "Tenant shown to Zack" (Both after the code is removed), "Nothing shown to Zack" (Lockbox after the code is removed). With no login, "once Zack signs in" takes the place of "shown to Zack": "Once Zack signs in", "Lockbox once Zack signs in", "Tenant once Zack signs in". "Nothing shown to Zack" stays as it is. The sr-only sentences say it in full, as today's lockbox row does.
- **Pick a unit first** applies only when a multi-unit building has no unit picked and nothing resolves. A code the units share still reads "Shown to Zack", as today (`lockbox.ts:34`). In this state the chip reads the choice, and Tenant, Lockbox and Tenant and lockbox are disabled with the description "Pick a unit first".
- In the rail the status line sits under the chip. Below lg the chip row has no room for it, so it's the menu's `MenuHeader`, first in the menu.
- **Add a tenant or code** is the chip when the job's unit, a single-unit property or a property with no units resolves to neither a tenant nor a code (Q8). It links to `?unit=<that label>`, or to an empty `?unit=` that lands on Units & access when the property has no units (section 5). In the rail "Nothing shown to Zack" sits under it. Below lg the link has no menu, so its own text stands in for the status line.
- The page sends the row what resolves (a tenant or not, a code or not, or pick a unit) and the contractor's first name, never the code. `view.tsx` passes it on where it carries `lockbox` today (`tasks/[id]/view.tsx:42`). The row works out the chip and the status line from `v.accessShare` by the same rule, so a pick shows at once.

**Sizes.** Laptop 1280 with a mouse: the rail, with the number on its own line and Call only. Tablet 768 on touch: the chip row, with "Text Jane" in the Tenant menu. Phone 375: the chip row as drawn. Phone 320: the chip row scrolls sideways, as it does today.

**The write.** Through `TaskFields`' `save()`, with no expected value, like Unit; only the assignee carries one (`expectedAssignee`, `core.ts:613`). Its toast reads "Access set to Tenant and lockbox", its key is `task:<id>:access`, and Undo writes the stored value back, null included. Picking the choice the chip already shows stores it, so the job stops following the default. `accessShare` joins `patchSchema` (`tasks/[id]/actions.ts:21`) as a nullable enum, `TaskPatch` and `TaskFieldValues`. `patchTask` writes it with an INTERNAL ACCESS event and sends no notice or email. The contractor sees the change the next time the job page loads. ACCESS events never fold (chunk 7's folding rules).

**The ACCESS line.** Nothing writes ACCESS today, and `activity.ts:172` prints "changed who can see this" whatever the data. Its data becomes `{ share: { from, to } }`, each an `AccessShare` value or null and never a name, plus `tenantAdded: true` on Q18's switch. The lines:

- a pick: "Connor set access to Tenant and lockbox" (or Tenant, or Lockbox);
- back to no stored choice, as Undo of a first pick does: "Connor set access back to the default";
- Q18's switch: "Connor added a tenant, so access is now Tenant and lockbox";
- an ACCESS event with no `share` keeps "Connor changed who can see this".

## 5. The property's Units editor

In `properties/[id]/edit-units.tsx`.

**The unit sheet** (`UnitSheet`, a `FormSheet` with `fullHeight`). Name and Lockbox sit in a `FieldGrid` (`edit-units.tsx:562`), side by side from sm. Under them a second `FieldGrid` holds two optional `FormField`s, also side by side from sm and stacked below it:

- "Tenant": a text input with `autoComplete="off"`. It draws `fieldErrors.tenantName`.
- "Tenant phone": `type="tel"` with `inputMode="tel"`. Its helper shows "Saves as 716-555-1234" when that differs from what's typed. It draws `fieldErrors.tenantPhone`: the existing `PHONE_INVALID`, or "Enter the tenant's phone number." when a name has none.
- While either has text, a ghost "Remove tenant" button under them clears both. Save still saves, so closing without saving keeps the tenant.
- On a house-meter row (`isHouseMeterRow`) the tenant fields don't show.

**The units list** (`ReadUnit`). A unit with a tenant gets a meta line under its name, "Tenant Jane Doe · 716-555-1234", above "Lockbox at …" when the unit has one. The word "Tenant" drops below 480, as "Lockbox" does. A unit without a tenant shows "Add tenant" in that same slot, which opens its sheet with the Tenant field focused. It's a ghost `size="sm"` button, 32px with a mouse and 44 on touch, offset like Add equipment (`-ml-2.5`, `edit-units.tsx:550`) so its label lines up with the name. House-meter rows get neither.

**The copy.** The Delete confirm's fallback (`edit-units.tsx:117`) reads "Its tenant, lockbox code, utilities and equipment go with it." The empty state (`edit-units.tsx:139`) reads "Add each unit to keep its tenant, lockbox code, utilities and equipment here."

**Opening a unit from a link.** The property page (`properties/[id]/page.tsx`) reads no `searchParams` today and opens unit sheets by index. It reads `?unit=<label>`: the page scrolls to Units & access, and `UnitsSection` opens the unit whose label matches (case-insensitive, as `resolveLockboxCode` matches) with the Tenant field focused. A label that matches nothing, or an empty `?unit=`, scrolls to the section and opens nothing. It opens once on load, and `?unit=` is dropped with `router.replace`, so a save's re-render or a refresh doesn't reopen it.

**Sizes.** Laptop 1280 and tablet 768: the sheet is the centered 672px dialog (`size="lg"`), and both pairs of fields sit side by side. Phone 375 and 320: a full-height sheet with every field stacked. In the list, the name truncates and the number stays whole at every width, as on the job page.

## 6. Playbooks

In the Apply flow (`templates/[id]/apply/apply-flow.tsx` and `src/lib/tasks/template-items.ts`). The page's `propertyOptions()` carries unit labels only, so the browser can't tell which units have a tenant. Picking a unit, picking a single-unit property, or restoring a draft with a unit (`useRestoredDraft`, `apply-flow.tsx:129`) calls a server action in `templates/actions.ts` that returns that unit's tenant or null. Only the picked unit's tenant reaches the browser. The fill-ins then prefill:

- `[Tenant]` and `[tenant name]` with the name;
- phone fill-ins whose name starts with "tenant" (`[tenant number]`, `[tenant phone]`, `[tenant cell]`; `tokenInputType` already marks them `tel`) with the phone as shown.

The prefill is a computed default, like `[Address]` in `valueOf`, and is never written to `typed`. So it never lands in the saved draft and never marks the form changed. Typing replaces it, and clearing the field leaves it empty. Nothing typed into a playbook is saved back to the unit yet (Q11). That would be a good follow-up for the New tenant playbook.

**Sizes.** The fill-ins keep the Apply page's `FieldRow` at every width; the prefill changes no layout.

## 7. Privacy

- `src/lib/portal/access-code.ts` stays the one portal file that reads `Property.units`. The guard (`src/lib/auth-guard.test.ts:435`) is a plain search for the word "units" in portal files, so in the portal only `access-code.ts` calls `accessState`. It gains `readJobAccess(db, propertyId, unitLabel, accessShare)`, which returns `{ lockbox: string | null, tenant: { name, phone, dial } | null }` for this one job, never the list. `pickLockboxCode` keeps its JSON guard and delegates the pick to `resolveLockboxCode`, so the portal and the staff page can't disagree.
- `readJobAccess` stays under the existing gate in `getJob` (`queries.ts:276`): only for the assigned contractor while the job is active.
- Open means `isActiveStatus`, Review included, exactly as the lockbox works today, so the tenant stays on the job page through Review until staff Approve. It never appears in My jobs, Updates, emails or the job-page notice.
- Playbook fill-ins are the one exception. Apply writes the prefilled name and number into the new tasks' titles, notes and checklists as text, as typing them does today (`apply-flow.tsx:148`). On a task assigned to a contractor they show wherever its title and notes do: My jobs, emails, and the job page after it closes too (`queries.ts:284`). That follows from Q11; the Access rule covers only the Tenant section.
- The staff task page sends the client only the tenant of this task's unit. It still never sends a lockbox code.
- The Asana importer never sets `accessShare`, so imported jobs take the default.

## 8. Files

Every portal, task and notification file here is the task migration session's code, so it reviews the diff before landing.

| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, one new migration |
| Units | `src/lib/property-types.ts` and its test (`readUnitTenant`, `tenantsAdded`), `src/lib/properties/service.ts` (`writeUnits`), `src/app/(app)/properties/actions.ts` (`unitSchema`), `src/app/(app)/properties/[id]/edit-units.tsx`, `src/app/(app)/properties/[id]/page.tsx` (`?unit=`) |
| The rule | `src/lib/tasks/lockbox.ts` and its test (`accessState`, beside `lockboxState`) |
| Portal | `src/lib/portal/access-code.ts` and its test, `src/lib/portal/queries.ts`, `src/lib/portal/jobs.ts`, `src/app/(portal)/p/jobs/[id]/page.tsx`, `_components/job-details.tsx` |
| Task page | `src/app/(app)/tasks/[id]/page.tsx`, `view.tsx`, `fields.tsx`, `actions.ts`; `src/lib/tasks/core.ts` (`patchTask`, `createNextRepeat`, `shareTenantOnOpenJobs`) and its test; `src/lib/tasks/service.ts`; `src/lib/tasks/activity.ts` and its test for the ACCESS lines |
| Playbooks | `src/lib/tasks/template-items.ts` and its test, `src/app/(app)/templates/[id]/apply/apply-flow.tsx`, `src/app/(app)/templates/actions.ts` |

**Tests.**

- `accessState` covers every row of the rule in section 2: the default, each choice, the move-out fallback, Both after a move-out, Both after the code is removed, Lockbox after the code is removed, no unit on single-unit and multi-unit properties (a code the units share included), and house-meter rows.
- `readUnitTenant` cleans the name and phone, refuses a phone without a name, a name without a phone and a number `readPhone` can't read, and writes the phone pair together.
- `tenantsAdded` finds a unit that gained a tenant by id, on a save with no rename too, and skips a tenant replaced by another.
- `shareTenantOnOpenJobs`, on `core.test.ts`'s fake transaction: an assigned, active job (Review included) with no stored choice and a code becomes BOTH, with one INTERNAL ACCESS event marked `tenantAdded` and no outbox row. A stored choice, a job stored as Tenant that fell back to the lockbox, a closed job, an unassigned job and a job with no code stay as they were. A job with no unit switches only on a single-unit property, and replacing one tenant with another switches nothing.
- `readJobAccess` returns this job's tenant only.
- `patchTask` writes `accessShare` with an INTERNAL ACCESS event and no outbox row, and an Undo to null stores null.
- `createNextRepeat` copies `accessShare`.
- Each ACCESS line reads as section 4 says, and an ACCESS event with no `share` keeps today's sentence.
- The Apply prefill fills only fields staff haven't typed in, and never enters the draft.
- `TENANT_VIEWED` is logged once a day, like the lockbox.
- `auth-guard.test` still finds `units` in access-code.ts alone.

**Checks.** `npm run typecheck`, `npm run lint`, `npm test` and the device check. The job page, the task page, the unit sheet and the property page opened with `?unit=` get checked by hand at 375 and 320 with a tenant, with a code, with both and with neither.

## 9. Reuse check

| | What |
|---|---|
| **Reused** | `Section`, `Code`, `buttonClass`, `telHref` and `textHref`, `readPhone` and `PHONE_INVALID`, `FieldError`, `firstName`, `Menu` with `selectionMode`, `description` and disabled items, `MenuHeader`, `useCoarsePointer`, the Details `Row`, `FormSheet`, `FieldGrid` and `FormField` in `UnitSheet`, `resolveLockboxCode`, `logLockboxView`'s once-a-day lock, `isHouseMeterRow`, `isActiveStatus`, `tokenInputType`, and `renameTaskUnits`' way of writing tasks inside the units save |
| **Extended** | `PropertyUnit`, `unitSchema` and `writeUnits` (the tenant fields, and Q18's switch before its early return); `access-code.ts` (`readJobAccess`, and `pickLockboxCode` delegating); `lockbox.ts` (`accessState`); the Lockbox row becomes the Access row; `noteJobViewed` (`tenantShown`) and `logLockboxView` (a kind); `patchTask`, `TaskPatch` and `createNextRepeat` (`accessShare`, and the server-only `accessReason`); the ACCESS line in `activity.ts`; the property page (`?unit=`); the Apply flow's computed defaults |
| **New** | `TenantSection`, a feature-only composition beside `LockboxSection`. It mirrors `AddressActions`, so no `docs/components.md` row. Also `readUnitTenant`, `tenantsAdded`, `shareTenantOnOpenJobs`, the Apply page's tenant server action, the `AccessShare` enum, `Task.accessShare` and `TENANT_VIEWED` |

**References** (Mobbin, Oct 26):

- [Grab Driver](https://mobbin.com/screens/ca866942-38fe-469f-94d9-f0541d458c02) and [inDrive](https://mobbin.com/screens/889175bf-3d1f-41b0-a873-2b18a81147c0): the person under the place, with a Call and message pair.
- [Postmates](https://mobbin.com/screens/e5108821-8dc9-4e25-89ff-a32ccbce5ebc) and [7-Eleven](https://mobbin.com/screens/a6ece76f-0fc3-4565-af86-dfda83b07099): the access code beside the contact.
- [Jobber](https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778): the client's full name on a field-service job.
- [Blinkit](https://mobbin.com/screens/477de4ec-7269-47dd-974f-cac3eac83f65) and [Careem](https://mobbin.com/screens/1ea96c85-4758-406b-9dc2-fbff1e10b748): the contact hidden or masked once the job is done.
- [Zoho CRM](https://mobbin.com/screens/98597a2d-9aed-4658-803f-4403509eac34): a phone value with a Call icon on desktop.

## 10. Build

One package after chunk 7 lands. It starts by re-reading every file cited here once chunks 6 and 7 are on main, and corrects the line cites against them. Then a Sonnet build in its own worktree, an Opus review on data and privacy and one on every size, then a Sonnet repair, per the model split. The task session reviews before landing and reruns its import tests, since `Task` gains a column. About an hour of build and checks.
