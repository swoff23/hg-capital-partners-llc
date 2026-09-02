# Task Templates — Bulk-Create Tasks for a Property

## Context

HG Capital OS manages a property portfolio. The same sets of tasks get created
over and over — playbooks the team currently keeps in an external checklist tool:
**NEW TENANT**, **NEW REFI**, **NEW PROPERTY**, **NEW MOVE OUT** — each run
against one property. Task titles carry placeholder tokens like `[Tenant]` and
`[Address]` that are hand-substituted each time.

Those playbooks were imported from Asana as ~68 orphan `Task` rows
(`bucket = "Template"`, `propertyId = null`) grouped by `Task.sectionRaw`. They
currently leak into the open-tasks list because nothing filters on `bucket`.
There is **no template model, no bulk-create, and no task-delete** in the app today.

**Goal:** build task templates into the app so the user can:

1. Define reusable templates — a named, ordered list of task definitions, each
   with a default assignee and an optional relative due-date offset.
2. Bulk-instantiate a template against a chosen Property: fill in placeholder
   tokens, pick an anchor date, review/edit/exclude individual task rows, then
   create them all at once (linked to that property).
3. Edit a template so future instantiations pick up the change.

**Decisions confirmed with the user:**
- Seed the 4 starter templates from the imported Asana playbooks **and** delete
  the ~68 leftover placeholder tasks.
- Due dates use **relative offsets** stored on each template item (`N` days from
  an anchor date chosen at apply time; negative = before).
- No new grouped task-list UI — apply redirects to `/tasks?property=<id>`, which
  already scopes the list to that property.

---

## Architecture (follows existing codebase conventions)

- **Persistence:** one new Prisma model `TaskTemplate` with an `items` **JSON
  column** edited wholesale — the established pattern for editable sub-record
  lists (`Property.units` via `updatePropertyUnits`, `Property.buildingCapex` via
  `updateBuildingCapex` in [properties/actions.ts](src/app/(app)/properties/actions.ts)).
  Not a child table: items are dumb value objects, ordering is array position,
  and there are exactly 2 (never-deleted) users.
- **Mutations:** `"use server"` actions in a colocated `actions.ts`, each opening
  with `await requireUser()` ([src/lib/auth.ts](src/lib/auth.ts)), Zod 4
  validation, `prisma` write, then concrete `revalidatePath(...)` calls (never
  route patterns), optional `redirect()`. Mirrors
  [tasks/actions.ts](src/app/(app)/tasks/actions.ts).
- **UI:** hand-rolled primitives from [src/components/ui.tsx](src/components/ui.tsx)
  (`Card`, `Button`, `LinkButton`, `Input`, `Select`, `Table/Th/Td`,
  `PageHeader`, `Badge`, `EmptyState`). No component library, no modal library.
- **Pages:** server components, `await requireUser()` first, `await params` /
  `await searchParams` (Next 16), `export const dynamic = "force-dynamic"`.
- The items editor copies the local-array editing pattern from
  [properties/[id]/edit-units.tsx](src/app/(app)/properties/[id]/edit-units.tsx)
  (`structuredClone` into `useState`, `mutate(fn)` helper, `dirty` check,
  Save/Discard bar, optional "discard unsaved changes?" confirm overlay).

---

## 1. Data model — `prisma/schema.prisma`

New model:

```prisma
model TaskTemplate {
  id          String    @id @default(cuid())
  name        String
  description String?   @db.Text
  anchorLabel String?   // e.g. "Move-in date", "Closing date"; UI falls back to "Start date"
  // Ordered task definitions; array order = sort order (like Property.units).
  // [{ title, assigneeUserId?, assigneeName?, dueOffsetDays? }]
  items       Json      @default("[]")
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tasks Task[]

  @@index([archivedAt])
}
```

Add provenance FK to `Task` (nullable, additive):

```prisma
  taskTemplate   TaskTemplate? @relation(fields: [taskTemplateId], references: [id], onDelete: SetNull)
  taskTemplateId String?

  @@index([taskTemplateId])
```

Provenance enables a "these came from template X" grouping later and a one-off
cleanup path if a batch is applied wrongly (there is no task-delete UI).

**Migration:** `npm run db:migrate` → name `task_templates`. Generated SQL is
additive (new table + `Task.taskTemplateId` column + index + FK), matching the
style of `prisma/migrations/20260830224014_property_building_capex/`. Commit the
generated folder. Prod applies it out-of-band against the direct/session URL per
the README runbook (the Supabase tx-pooler build skips DDL).

---

## 2. Types + helpers — `src/lib/template-types.ts` (new)

Mirrors [src/lib/property-types.ts](src/lib/property-types.ts) (types + domain helpers together).

```ts
export type TaskTemplateItem = {
  title: string;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  dueOffsetDays?: number | null; // days from the anchor date; negative = before
};

export function parseTemplateItems(json: unknown): TaskTemplateItem[];   // defensive parse, like parseUnits
export function extractTokens(strings: string[]): string[];             // unique [Token] names, first-seen order
export function applyTokens(input: string, values: Record<string, string>): string; // [Token] -> value; unknown left verbatim
export function addDays(iso: string, n: number): string;                // "yyyy-mm-dd" + n days, UTC-arithmetic (DST-safe)
export const ADDRESS_TOKEN_RE: RegExp;                                  // /^(address|property|property address)$/i
```

- Token regex: `/\[([^\][]+)\]/g` — ignores empty `[]` and unbalanced brackets.
- `[Address]`-type tokens auto-fill from `shortAddress()` in
  [src/lib/normalize.ts](src/lib/normalize.ts) (strips `", Buffalo, NY"`).
- `addDays`: `Date.UTC(y, m-1, d) + n*86400000` then `.toISOString().slice(0,10)`.

---

## 3. Server actions — `src/app/(app)/templates/actions.ts` (new)

`"use server"`. Every export starts with `await requireUser()`. `formToObject`
([src/lib/forms.ts](src/lib/forms.ts)) for form actions; plain typed args for the
JSON ones (like `updatePropertyUnits` / `patchTask`).

| Action | Signature | Notes |
|---|---|---|
| `createTemplate` | `(formData: FormData)` | `metaSchema.parse` (name ≥ 2, description?, anchorLabel?); create with `items: []`; `revalidatePath("/templates")`; `redirect("/templates/<id>")` |
| `updateTemplateMeta` | `(id, formData: FormData)` | `formData.has()` / trim pattern from `patchProperty`; name written only if non-empty; `revalidatePath("/templates")` + `/templates/<id>` |
| `updateTemplateItems` | `(id, items: unknown)` | **line-for-line mirror of `updatePropertyUnits`**: `z.array(itemSchema).parse`, drop blank titles, `title.trim()`, if `assigneeUserId` set → null out `assigneeName`, coerce `dueOffsetDays` to an int or null; write whole `items` column; `revalidatePath("/templates/<id>")` + `/templates` |
| `archiveTemplate` / `unarchiveTemplate` | `(id)` | set / clear `archivedAt`; revalidate both paths |
| `deleteTemplate` | `(id)` | hard delete (tasks' FK → SetNull); revalidate `/templates`. UI uses archive by default; this is an escape hatch |
| `applyTemplate` | `(templateId, input: unknown)` | **the bulk create** — see below |

`itemSchema`:
```ts
z.object({
  title: z.string().trim().min(1),
  assigneeUserId: z.string().nullish(),
  assigneeName: z.string().nullish(),
  dueOffsetDays: z.coerce.number().int().nullish(),
})
```

### `applyTemplate(templateId, input)`

Trust model matches `createTask` (server trusts the reviewed titles; Prisma
parameterizes) but **re-reads** template/property/users server-side per the
server-actions security guidance.

```ts
const applySchema = z.object({
  propertyId: z.string().min(1),
  rows: z.array(z.object({
    title: z.string().trim().min(1),
    assigneeUserId: z.string().nullish(),
    assigneeName: z.string().nullish(),
    dueDate: z.string().nullish(),   // yyyy-mm-dd, already resolved client-side
    include: z.boolean(),
  })),
});
```

1. `await requireUser()`; `applySchema.parse(input)`.
2. `Promise.all`: `taskTemplate.findUnique` (id only), `property.findUnique`
   (id only), `user.findMany` (ids). Throw if template/property missing.
3. Build rows: `include && title.trim()` only; validate `assigneeUserId` against
   the live id set (fallback unassigned / `assigneeName`); `assigneeName` nulled
   when a user id wins (mirrors `patchTask`); `dueDate ? new Date(dueDate) : null`;
   `propertyId`; `bucket: "Property"` (same rule as `createTask`);
   `taskTemplateId`.
4. `await prisma.task.createMany({ data })` — one statement.
5. `revalidatePath("/tasks")`, `revalidatePath("/properties/<propertyId>")`,
   `revalidatePath("/")`, then `redirect("/tasks?property=<propertyId>")`
   (revalidate before redirect — redirect throws).

Payload is a small plain object (~40 rows max, well under the server-action
limit); no `FormData`.

---

## 4. Routes / pages

```
src/app/(app)/templates/
  actions.ts
  page.tsx                     list; reads ?propertyId
  new/page.tsx                 name + description + anchor-label form
  [id]/page.tsx                loads template + users; rename form + items editor + "Apply" button
  [id]/edit-items.tsx          "use client" — items editor (copy edit-units.tsx pattern)
  [id]/apply/page.tsx          loads template + properties + users; reads ?propertyId
  [id]/apply/apply-flow.tsx    "use client" — property + anchor date + tokens + review + submit
```

### `/templates` — list
`taskTemplate.findMany({ orderBy: [{ name: "asc" }], include: { _count: { select: { tasks: true } } } })`;
split active vs `archivedAt != null` in JS. `PageHeader` with `+ New template`.
`Card` + `Table` (like [properties/page.tsx](src/app/(app)/properties/page.tsx)):
**Name** (→ `/templates/<id>`) · **Tasks** (`parseTemplateItems(items).length`) ·
**Applied** (`_count.tasks`) · **Apply** button
(`/templates/<id>/apply` + `?propertyId=` passthrough when present) · **Archive**.
Archived templates in a muted section with **Unarchive**. `EmptyState` otherwise.
When `?propertyId` is set, show an "Applying to <address>" banner and thread the
param into every Apply link.

### `/templates/new`
Mirror [deals/new/page.tsx](src/app/(app)/deals/new/page.tsx): `<form action={createTemplate}>`
— `Input name="name" required`, `Textarea name="description"`,
`Input name="anchorLabel"` (placeholder "e.g. Move-in date"), submit. Redirects
to the editor.

### `/templates/[id]` — editor page
`Promise.all([ taskTemplate.findUnique({ where: { id } }), user.findMany({ orderBy: { name: "asc" }, select: { id, name, email } }) ])`;
`notFound()` if missing. `BackLink fallback="/templates"`. Inline rename form
(client, `key={template.updatedAt.toISOString()}` remount trick from
[deals/[id]/edit-deal.tsx](src/app/(app)/deals/[id]/edit-deal.tsx)) → `updateTemplateMeta`.
Then `<ItemsEditor key={template.updatedAt.toISOString()} templateId={id}
initial={parseTemplateItems(template.items)} anchorLabel={template.anchorLabel} users={users} />`.
`LinkButton` → `/templates/<id>/apply`.

### `/templates/[id]/edit-items.tsx` — `"use client"`
Copy the [edit-units.tsx](src/app/(app)/properties/[id]/edit-units.tsx) shape:
`useState(structuredClone(initial))`, `useTransition`,
`dirty = JSON.stringify(items) !== JSON.stringify(initial)`, `mutate(fn)` helper.
Per row: full-width title `Input` (render `extractTokens([title])` as small gray
`Badge`s beneath), assignee `Select` (users) + small external-name `Input` (the
two-field pattern from [tasks/new/page.tsx](src/app/(app)/tasks/new/page.tsx)),
a narrow `Input type="number"` "due `[ ]` days after {anchorLabel ?? 'start'}",
**↑ / ↓** buttons (array swap in `mutate`), **Remove** (`splice`).
`+ Add task` pushes a blank item. Sticky Save (`disabled={!dirty || pending}`) /
Discard bar; `save()` → `start(async () => { await updateTemplateItems(templateId, items); })`;
the parent's `key={updatedAt}` remounts with fresh `initial` so `dirty` resets.
Copy the "Discard unsaved changes?" overlay from edit-units.tsx (lines 107–135)
for the Cancel-while-dirty path.

### `/templates/[id]/apply/page.tsx`
`Promise.all([ taskTemplate.findUnique, property.findMany({ select: { id, address }, orderBy: { address: "asc" } }), user.findMany(...) ])`;
`notFound()` if template missing. Render
`<ApplyFlow template={{ id, name, anchorLabel, items: parseTemplateItems(items) }}
properties={properties} users={users} initialPropertyId={sp.propertyId ?? ""} />`.
Show a note if `archivedAt` (still allow apply).

### `/templates/[id]/apply/apply-flow.tsx` — `"use client"`
`import { applyTemplate } from "../../actions"` (direct import, like
[tasks/task-checkbox.tsx](src/app/(app)/tasks/task-checkbox.tsx)).

State: `propertyId` (seeded), `anchorDate` (yyyy-mm-dd, default today),
`tokenValues: Record<string,string>`,
`rows: { include, titleOverride?, assigneeUserId, assigneeName, dueDateOverride? }[]`
(seeded from items: `include: true`, assignee from item default).
`useTransition`.

Derived (`useMemo`):
- `tokens = extractTokens(items.map(i => i.title))`
- `resolvedTitle(i) = rows[i].titleOverride ?? applyTokens(items[i].title, tokenValues)`
- `resolvedDue(i) = rows[i].dueDateOverride ?? (items[i].dueOffsetDays != null ? addDays(anchorDate, items[i].dueOffsetDays) : null)`
- `count = rows.filter((r,i) => r.include && resolvedTitle(i).trim()).length`

`useEffect` on `propertyId`: for each token matching `ADDRESS_TOKEN_RE` whose
value is still untouched, set it to `shortAddress(selectedProperty.address)`.

UI (`PageHeader`, `Card`, `Select`, `Input`, `Button`, `Table`):
1. **Property** — `Select` (`— choose a property` + list). Required.
2. **{anchorLabel ?? "Start date"}** — `Input type="date"`, default today.
3. **Fill in placeholders** (only if `tokens.length`) — one `Input` per token
   labelled `[Token]`; address tokens get a "from property" hint.
4. **Review tasks** — `Table`: include checkbox · title `Input`
   (→ `titleOverride`; "reset" link when overridden) · assignee `Select` ·
   due-date `Input type="date"` (prefilled from `resolvedDue`, → `dueDateOverride`) ·
   amber `Badge "unfilled"` when `resolvedTitle` still matches `/\[[^\]]+\]/`.
5. **Create {count} tasks** — `disabled={!propertyId || count === 0 || pending}`:
   ```ts
   start(async () => {
     await applyTemplate(template.id, {
       propertyId,
       rows: rows.map((r, i) => ({
         title: resolvedTitle(i),
         assigneeUserId: r.assigneeUserId,
         assigneeName: r.assigneeName,
         dueDate: resolvedDue(i),
         include: r.include,
       })),
     });
   });
   ```
   `applyTemplate` ends in `redirect()`, so the transition navigates to
   `/tasks?property=<id>` — no local success state.

---

## 5. Nav + entry points

- **[src/components/nav.tsx](src/components/nav.tsx)** — add to `LINKS` after
  Tasks: `{ href: "/templates", label: "Templates", icon: <>…3 rects…</> }`
  (icon = raw `<path>`/`<rect>` children; nav wraps them in one
  `<svg fill="none" stroke="currentColor">`). Active check
  `pathname.startsWith("/templates")` — no collision with `/tasks`.
- **[src/app/(app)/tasks/page.tsx](src/app/(app)/tasks/page.tsx)** header — wrap
  actions in a flex row: `<LinkButton href="/templates" variant="secondary">Apply template</LinkButton>`
  next to the existing `+ New task`.
- **[src/app/(app)/properties/[id]/page.tsx](src/app/(app)/properties/[id]/page.tsx)** —
  in the Tasks `CardHeader`, add
  `<LinkButton href={\`/templates?propertyId=${property.id}\`} size="sm" variant="secondary">Apply template</LinkButton>`
  beside `+ Task` (query-string hrefs already used here for `/tasks/new?propertyId=`).

---

## 6. Seeding — `scripts/seed-task-templates.ts` (new, `tsx`)

Run like [scripts/import-building-capex.ts](scripts/import-building-capex.ts):
`npx tsx scripts/seed-task-templates.ts` (dry run) / `--apply`.

1. `task.findMany({ where: { bucket: "Template" }, orderBy: { createdAt: "asc" }, select: { id, title, sectionRaw, assigneeUserId, assigneeName } })`
   (`createdAt asc` ≈ playbook order).
2. Group by `sectionRaw` → the 4 sections.
3. `name = sectionRaw.replace(/\s*\[address\]\s*/i, "").replace(/\s+/g, " ").trim().toUpperCase()`
   → `NEW TENANT`, `NEW REFI`, `NEW PROPERTY`, `NEW MOVE OUT`.
4. Map a sensible `anchorLabel` per name (Move-in date / Refinance date /
   Closing date / Move-out date).
5. `items = tasks.map(t => ({ title: t.title.trim(), assigneeUserId: t.assigneeUserId ?? null, assigneeName: t.assigneeName ?? null, dueOffsetDays: null }))`.
6. Idempotency: `findFirst({ where: { name } })` → create if absent, **skip +
   warn** if present (never clobber a template the user has edited).
7. Orphan cleanup (behind `--apply`, prints the count, `--keep-orphans` opt-out):
   `task.deleteMany({ where: { bucket: "Template", propertyId: null } })`.

Add an npm script `"seed:templates": "tsx scripts/seed-task-templates.ts"` for discoverability.

---

## 7. Interim cleanup of the orphan playbook tasks

Until the seeder's `deleteMany` runs (and to keep re-imports clean):

- **[src/app/(app)/tasks/page.tsx](src/app/(app)/tasks/page.tsx)** — add
  `NOT: { bucket: "Template" }` to `where`, and to the `openCount` / `mineCount`
  counts.
- **[src/app/(app)/page.tsx](src/app/(app)/page.tsx)** (Home) — add the same
  `NOT: { bucket: "Template" }` guard to the open-tasks count/list.
- **[scripts/migrate/04-tasks.ts](scripts/migrate/04-tasks.ts)** — in
  `classifySection`, return `null` (skip) for the `NEW … [address]` sections so
  `npm run migrate` never recreates orphan `bucket:"Template"` rows.

`TASK_BUCKETS` in [src/lib/config.ts](src/lib/config.ts) keeps `"Template"` for
historical safety; nothing depends on it after cleanup.

---

## 8. File-by-file

**New (10):**
- `prisma/migrations/<ts>_task_templates/migration.sql` (generated)
- `src/lib/template-types.ts`
- `src/app/(app)/templates/actions.ts`
- `src/app/(app)/templates/page.tsx`
- `src/app/(app)/templates/new/page.tsx`
- `src/app/(app)/templates/[id]/page.tsx`
- `src/app/(app)/templates/[id]/edit-items.tsx`
- `src/app/(app)/templates/[id]/apply/page.tsx`
- `src/app/(app)/templates/[id]/apply/apply-flow.tsx`
- `scripts/seed-task-templates.ts`

**Modified (6):**
- `prisma/schema.prisma` — `TaskTemplate` model; `Task.taskTemplateId` + relation + index
- `src/components/nav.tsx` — `LINKS` entry
- `src/app/(app)/tasks/page.tsx` — header button + `NOT: { bucket: "Template" }` guards
- `src/app/(app)/page.tsx` — `NOT: { bucket: "Template" }` guard on open-tasks count/list
- `src/app/(app)/properties/[id]/page.tsx` — "Apply template" button in Tasks card
- `scripts/migrate/04-tasks.ts` — skip `NEW … [address]` sections
- `package.json` — `seed:templates` script

---

## 9. Verification

1. `npm run db:migrate` (name `task_templates`) — creates/applies migration, regenerates client.
2. `npm run typecheck` (`next typegen && tsc --noEmit`) — confirms generated
   `PageProps<"/templates">` etc.; watch `await params`/`await searchParams`; no
   `any` (use `unknown` + Zod like `updatePropertyUnits`).
3. `npm run lint` — `react-hooks/exhaustive-deps` on the apply-flow `useEffect`
   (one-line disable is already used in [tasks/filters.tsx](src/app/(app)/tasks/filters.tsx));
   escape `&`/`'` in JSX as in edit-units.tsx.
4. `npm run build`.
5. `npx tsx scripts/seed-task-templates.ts` — eyeball 4 groups + counts — then `--apply`.
6. Manual click-through (dev server via the Browser preview tools):
   - `/templates` lists 4 seeded templates with Tasks / Applied counts; sidebar
     "Templates" entry shows active state.
   - `/templates/new` → create → lands on editor.
   - Editor: add / edit / reorder (↑↓) / remove items, set default assignee, set
     a due offset, Save persists (reload), Discard + dirty-guard work, rename persists.
   - `/templates/<id>/apply`: pick a property → `[Address]` auto-fills with the
     short address; set anchor date; fill `[Tenant]`; review list + due dates
     update live; uncheck a row; override a title then Reset; **Create N tasks**
     → redirects to `/tasks?property=<id>` showing the new tasks — verify each is
     `status OPEN`, `bucket "Property"`, `propertyId` + `taskTemplateId` set,
     correct assignee, due = anchor + offset.
   - Property page Tasks card lists them; `+ Task` / "Apply template" both present.
     Home open-tasks count up by N.
   - Archive → moves to archived section; Unarchive restores.
   - Direct `POST` to `applyTemplate` with no session cookie → redirects to `/login`.
   - Post-seed: no `bucket="Template"` rows anywhere in `/tasks` or Home.

---

## 10. Risks / edge cases

- **Unfilled token** (`[Tenant]` left blank): `applyTokens` leaves it literal;
  review step flags the row with an amber badge. Optional soft confirm ("N tasks
  still contain placeholders — create anyway?"). Not hard-blocked; server does not re-check.
- **Manual title edit then token change**: the `titleOverride` layer freezes that
  row; "reset" clears it.
- **Apply to a Deal**: unsupported by design — picker is properties only;
  `applyTemplate` always sets `propertyId` + `bucket:"Property"`.
- **Stale default `assigneeUserId` in JSON**: `applyTemplate` validates against
  the live user set, falls back to unassigned.
- **No task-delete / undo**: a wrong "Create 30 tasks" leaves 30 tasks with no
  in-app cleanup; `taskTemplateId` + a tight `createdAt` window enables a one-off
  script. Acceptable for 2 trusted users — call it out to the user.
- **`dueOffsetDays` DST**: `addDays` uses UTC arithmetic on the date parts, so no
  off-by-one across DST boundaries. Created `dueDate` stored as UTC midnight,
  same as `createTask`'s `new Date(p.dueDate)`.
- **Re-running the seeder** after edits: create-if-absent / skip-with-warning —
  never overwrites `items`.
- **React Compiler** (`reactCompiler: true`): keep the `structuredClone` +
  `mutate(fn)` shape (no in-render mutation); `useMemo` for derived rows is fine.
- **Template name not unique**: intentional; list will show duplicates if created.
