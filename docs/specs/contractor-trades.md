# Contractor trades: one list, one picker

The spec for standardizing contractor trades and editing them with one multi-pick picker. This is a draft for Connor: nothing is built, and building waits for an explicit "build it". Checked against `9a822de` (main's head on Nov 14). Its only nearby change is one line in `contractors/[id]/page.tsx`, where `PortalAccessCard` lost its `staffName` prop.

## 1. Summary

**What's wrong today**

- **Trades are one free-text column.** `Contact.trades` holds text like "Plumbing / HVAC". Every reader splits it on the slash: the filter, the list, the search, the assignee picker and the import.
- **The spellings have drifted.** The local import has 31 spellings across 30 contractors: Paint and Painting, Plumber and Plumbing, three flooring entries, plus "Everything" and "Misc.". The Trade filter lists all of them.
- **There are three ways to edit trades.** The New contractor form uses a chip field (`Combobox multiple`). The contractor page uses a text box that says "Separate trades with a slash." The filter uses a checklist.

**What changes**

- Trades become one list in the database (`Trade`), and each contractor links to the trades they do (`ContactTrade`).
- The 31 spellings fold into 17 trades. Prod gets a read-only dry run first.
- Every place staff pick trades uses the same search checklist: the contractor page, the New contractor form, and the filter's existing rows. A trade that isn't on the list yet can be added straight from the picker.
- Wherever trades are a field, they read as gray tags: the contractor page and the list's Trades column. Where they're one line of text under a name (the phone list row, the assignee picker, search), they read "Plumbing, HVAC".

## 2. Decisions (Connor, Nov 14)

| # | Question | Decision |
|---|---|---|
| 1 | Where trades live | One `Trade` table with contractors linked to it, not a list field on each contact and not the slash text |
| 2 | Cleanup | The 17 trades in section 3.2, with General renamed **Handyman** |
| 3 | Adding a trade | Any staff member, from the picker ('Add "Roofing"'). No Settings page yet |
| 4 | Contractor page | **D**: tags at rest, and a click or tap anywhere on them opens the search checklist. No × on the tags. Chosen after Mobbin research (section 6) |
| 5 | New contractor form | A field that opens the same checklist, which replaces the chip field |
| 6 | Contractor list | Tags on one line, then "+N" for the rest. The phone row stays text |
| 7 | Saving | Once, when the checklist closes, with one toast and Undo |
| 8 | Rollout | Dry run on prod, Connor approves the map, then one deploy that builds and links everything. The old column stays as a backup for a release |

## 3. Data

### 3.1 Schema

```prisma
model Trade {
  id        String         @id @default(cuid())
  name      String         // "Plumbing", "Pest control"
  key       String         @unique // the name lowercased, single spaces, no commas: tradeKey()
  createdAt DateTime       @default(now())
  contacts  ContactTrade[]
}

model ContactTrade {
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  contactId String
  trade     Trade   @relation(fields: [tradeId], references: [id], onDelete: Restrict)
  tradeId   String
  @@id([contactId, tradeId])
  @@index([tradeId])
}
```

- `Contact` gains `tradeLinks ContactTrade[]`. `Contact.trades` (the text) stays for one release as a read-only backup. Nothing writes it after the deploy, and a later migration drops it.
- `key` keeps "plumbing" from ever sitting beside "Plumbing". It's a column Prisma knows rather than an index on `lower(name)`, which Prisma can't describe and a later `migrate dev` would drop.
- A trade that no contractor has any more (archived ones count) comes off the list when the save that left it empty runs, so a mistyped "Roofng" doesn't stay behind. Adding it again, or Undo, brings it back.
- Both tables `ENABLE ROW LEVEL SECURITY` (README, Rules of the road). `src/lib/db-rls.test.ts` checks it.
- The list lives in the database, not in code, so a second business would start with its own (docs/other-businesses-later.md).

### 3.2 The map

| Trade | From |
|---|---|
| Cleaning | Property Cleaning, House Cleaner |
| Cleanouts | Bulk Cleaning, Trash clean up |
| Demo | Demo |
| Drywall | Drywall |
| Electric | Electric |
| Flooring | Flooring, Floor install, Floor Install only |
| Framing | Framing |
| Handyman | General, Everything, Misc. |
| HVAC | HVAC, minor HVAC |
| Landscaping | Landscaping |
| Notary | Notary |
| Painting | Paint, Painting |
| Pest control | Bees, Rats, Pests |
| Plumbing | Plumbing, Plumber, Exterior Plumbing |
| Snow removal | Plowing, Snow Shoveling |
| Tile | Tile, Tile Install |
| Trim | Trim |

- Matching ignores case and surrounding spaces, and splits on "/" like `cleanTrades` does today.
- The map lives in one module, `src/lib/contractors/trade-map.ts`. The migration's SQL holds the same table, and `trade-map.test.ts` fails if the two differ. The dry run, the cleanup script and the spreadsheet import read the module.
- "minor", "only" and "Exterior" are dropped on purpose (decision 2). The dry run prints every before and after.

### 3.3 Rollout (decision 8)

1. **Dry run.** `scripts/trades-dry-run.ts` reads a database and prints every distinct spelling with its trade and contractor count, every spelling the map doesn't cover, each contractor's trades before and after, and the list the migration leaves. It only selects and writes nothing. `npm run trades:dry-run` reads the local database; for prod, `npx tsx --env-file=<the prod env file> scripts/trades-dry-run.ts`. Prod's run on Nov 14 matched the local import, plus one spelling the map doesn't cover: "Test", on the test contractor.
2. **Connor approves.** Any uncovered spelling gets a row in the map, or Connor says it becomes its own trade.
3. **One deploy.** The migration creates both tables, inserts the 17 trades plus any approved extras, and links every contractor from its current text. A spelling still not in the map becomes its own trade, with its first letter capitalized, so nothing is lost. The production build applies it (`scripts/prebuild.mjs`), and the code that reads links ships in the same push.
4. **Later release.** A migration drops `Contact.trades` once Connor has looked at prod.

## 4. Screens

All three use one checklist: `OptionList selectionMode="multiple"` inside `PickerLayer`. That's a popover with a mouse or on a touch tablet, and a titled sheet on a touch phone.

### 4.1 The checklist

- **Search:** "Search trades" at the top. Matching ignores case and uses every word, as `OptionList` does today.
- **Order:** trades already picked when it opens come first, then the rest A to Z. The order is fixed when it opens, so a tick never moves a row under the pointer.
- **Add row:** when the search has text that matches no trade exactly (ignoring case), the last row reads 'Add "Roofing"'. Picking it creates the trade and ticks it. The new name is trimmed, inner spaces are collapsed, the first letter is capitalized, and it's capped at 40 characters. Typing "plumb" shows Plumbing and no Add row. The filter's checklist has no Add row.
- **No counts:** counts stay in the filter, where they help narrow the list. The editing checklist doesn't show them.
- **Sizes:** the popover is as wide as its longest row. Rows are 44px on touch. On a phone the sheet has the field's name as its title and a Done button in its footer.

### 4.2 Contractor page (decision 4, D)

- **At rest:** the Trades row shows the trades as `tagClass` tags, A to Z, wrapping inside the value column. A contractor with none shows the rail verb "Add trades".
- **Opening:** the whole tag area is the trigger, a React Aria button labeled "Trades, Plumbing, HVAC, edit". A click or tap opens the checklist under it. There's no × on any tag and no hover-only control.
- **Saving (decision 7):** ticks are held while the checklist is open. Closing it saves once: by clicking away, Esc, Tab out or Done. Nothing saves if the set didn't change.
- **Toast:** "{First name}'s trades saved" with Undo, under 90 characters. Undo restores the set exactly as it was when the checklist opened.
- **Conflict:** if someone else changed this contractor's trades after the page loaded, the save is refused and the row shows the usual conflict line and buttons (`FactLine`, `ConflictButtons`).
- **Sizes:** at 1280 the popover sits under the tags. At 768 it's the same popover with 44px rows. At 375 it's the titled sheet. The tags wrap at every width, and the row never scrolls sideways.

### 4.3 New contractor form (decision 5)

- The Trades field takes the `Select` trigger's field look: label "Trades", placeholder "Add trades" and a chevron. Once trades are picked, they show as tags inside the field, which grows to a second line if it needs one.
- A click opens the same checklist, with the Add row, as a popover or, on a phone, the sheet. Picks apply as they're ticked, because the form saves on Create.
- The form sends the picked names on one line ("HVAC, Roofing"). The create service matches them to the list ignoring case and adds any it doesn't have, in the same transaction as the contractor.
- The draft (`useDraft`) keeps the picks by name.

### 4.4 Contractor list (decision 6)

- From `sm` up, the Trades column shows tags A to Z on one line: as many whole tags as fit, then "+N" in `--fg-3`. A small client piece measures the cell after layout. Until it measures, the cell shows the first tag and "+N", so the first paint never overflows. The cell's accessible name lists every trade.
- Below `sm` the line under the name stays text: "Company · Demo, Drywall, Framing…", truncated as today.
- The loading skeleton's Trades column draws tag-shaped blocks instead of word lines.

### 4.5 Filter, search and the assignee picker

- **Trade filter:** it keeps its look (your first screenshot). The URL becomes `?trade=<id>,<id>`, and `matchesTrades` compares ids, so the substring caveat in `query.ts` goes away. Counts come from the rows the other filters leave (the same rows "Needs W-9" already reads), and a trade with zero still lists. An old `?trade=Plumbing` link redirects to the same list by id, so bookmarks keep working and the checklist shows the pick.
- **Search** (`search-results.ts`, the command palette): it matches a trade name through the link, and the result line reads "Plumbing, HVAC".
- **Assignee picker:** the contractor's line under the name reads "Plumbing, HVAC", and its search matches trade names. Who counts as a contractor ("has a trade or any job", `assignee-people.ts`) becomes `tradeLinks: { some: {} }`.

## 5. Reuse check

**Reused as is**

- `PickerLayer`: the popover or phone sheet, already used by every picker.
- `OptionList` with `selectionMode="multiple"` and `CheckboxMark`: the checklist rows the filter already uses.
- `tagClass`: the tag look.
- `useFactSave`: its toast, Undo, pending state and conflict handling, plus `FactLine` and `ConflictButtons`.
- `useToast`, `Sheet`'s and `SheetView`'s footer slot, `CreateForm`, `useDraft`, `FilterBar`'s multi facet, `Table`, `Th`, `Td`, `Block` (the list's loading tags).

**Extended**

- `OptionList` gets `onCreate` with `createLabel`: the 'Add "…"' row, lifted from `Combobox allowCustom` so the two share the rule and the copy.
- `inline-field.tsx` gets `InlineTags`, a sibling of `InlineSwitch` on the same `useFactSave`. It holds picks until close and saves once.
- `Select`'s trigger look is reused by a multi field. It's the same field chrome, with tags inside instead of one label.
- `PickerLayer` gets `sheetFooter`, for the phone sheet's Done.

**New**

- `TagsField`, `TagsChecklist` and `TagList` in `src/components/tags-field.tsx`: the form field from 4.3 and the checklist both screens share. They get a row in docs/components.md ("Pick many"), so any later multi-value field uses them.
- `TagOverflow` in the same file: one line of tags with "+N". There's no existing pattern; it follows Attio's table cells (section 6).
- `Trade`, `ContactTrade`, `trade-map.ts`, `trades.ts` (the select and the one-line form), `trade-links.ts` (the write, on any client, so a scratch-database test reaches it) behind `setContactTrades` in `lib/contractors/service.ts` (services own writes), and `trades:dry-run`.

**Retired**

- `Combobox`'s `multiple` mode, whose only user was the New contractor form. Its docs/components.md row loses the `multiple` sentence. `allowCustom` stays for single values (CapEx systems, property entity).
- The "Separate trades with a slash." helper, `cleanTrades` and `tradeTokens`. The map module splits the old text where something still reads it (the import, the dry run). `matchesTrades` and `tradeOptions` stay, now on ids.
- The cleanup script's repeated-trades fix (ADMIN-023), which a list can't need. Its hand fixes now add a trade link ("House Cleaner" is Cleaning).

## 6. References

- **Tags at rest, edited through a search checklist, with no × on the tags:** [Linear](https://mobbin.com/screens/7fef18f2-1c32-4bc6-9d27-21241a65e0e4), [Attio](https://mobbin.com/screens/8415dcfb-b1f0-46b2-adf3-278d1aa56b3f).
- **The checklist with an add or create row:** [Copilot Money](https://mobbin.com/screens/abdf604e-f3b5-4708-800a-944579ef460d), [Productboard](https://mobbin.com/screens/3cf88e7c-4c5c-46ba-855b-6350aaa1d302), [Rox](https://mobbin.com/screens/00952ccd-abd5-4377-aafd-18e8daa95866).
- **The phone sheet with search and check rows:** [Linear Mobile](https://mobbin.com/screens/865f7524-2477-4721-973a-0bb398b08eb8), [Notion Mail](https://mobbin.com/screens/1cd59b1d-c17f-4c07-a243-55f7e71c137c), [Fiverr](https://mobbin.com/screens/5a1a4f7a-87ac-49fa-b889-1d04152ee4e8).
- **Tags with an × on each, considered and not used:** [Midday](https://mobbin.com/screens/0d536df3-5dd7-44d7-94c1-62a9b918eacb), [Ditto](https://mobbin.com/screens/7bbbfb41-9d4a-4ca3-8ee6-17b799ffb7bc), [Squarespace](https://mobbin.com/screens/0cbf303d-fa3d-48cf-b2f3-470cc1ddf946).
- **Explicit Save and Cancel, considered and not used:** [Origin](https://mobbin.com/screens/f2bafdf2-6991-4d5b-824d-ce38eaa310ea).

## 7. Files

- **Schema and data:** `prisma/schema.prisma`, a new migration, `src/lib/contractors/trade-map.ts` (new), `scripts/trades-dry-run.ts` (new), `scripts/migrate/02-contractors.ts`, `scripts/cleanup-contacts.ts`, `src/lib/contacts.ts`.
- **Services and queries:** `src/lib/contractors/service.ts`, `src/lib/contractors/contact-fields.ts` (trades leave the text fields), `src/app/(app)/contractors/actions.ts`, `query.ts`, `filter-actions.ts`, `src/lib/search-results.ts`, `src/lib/tasks/assignee-options.ts`, `src/lib/tasks/assignee-people.ts`.
- **UI:** `src/components/tags-field.tsx` (new), `option-list.tsx`, `inline-field.tsx`, `combobox.tsx`, `contractors/[id]/contact-section.tsx`, `contractors/[id]/page.tsx`, `contractors/new/new-contractor-form.tsx`, `new-contractor-screen.tsx`, `contractors/(list)/page.tsx`, `(list)/loading.tsx`, `contractors/filters.tsx`.
- **Docs:** `docs/components.md`, covering the `TagsField` and `TagOverflow` rows, the `OptionList` add row and `Combobox` without `multiple`.

## 8. Checks

- **Unit tests:** the map (every local spelling lands where section 3.2 says, an unknown spelling is kept, and the migration's table equals the module's), the name rule for new trades, the filter by id and the old-name mapping, the counts, and the RLS test for both tables. `trade-links.pg.test.ts` runs the save on a scratch Postgres (save with a new name, conflict, a trade left with no one, Undo, clear); like the repo's other `.pg` tests it's opt-in.
- **Device check:** `npm run test:devices` over `/contractors`, `/contractors/[id]` and `/contractors/new`. By hand at 375 and 320: the checklist sheet, the Add row, the toast and Undo, a contractor with six trades on the page and in the list, and the form field with tags on two lines.
- **Landing:** typecheck, lint and `npm test` on the merged code. Then the dry run against prod and Connor's OK on the map before the push to main.

## 9. Later, not in this build

- A Settings page to rename, merge or delete trades (decision 3). The table makes it a page with no data changes.
- Dropping `Contact.trades` (section 3.3, step 4).
