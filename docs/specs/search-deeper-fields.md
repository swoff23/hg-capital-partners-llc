# Search: model numbers, utility accounts, loans and contractor phones

This spec lets the ⌘K search find a property by an equipment model number or type, a National Grid, National Fuel or water account number, its loan or insurance numbers and companies, and a contractor by phone or email. It is the "deeper fields" part of phase 5 in [search.md](search.md) (2.10, IA-I03), cut to what Connor picked. It was planned with Connor on Nov 17, 2026, against `ff4e853`. He said "build it" the same day, and it was built to this spec; section 10 lists where the build differs from the plan and why.

## 1. Summary

**What's wrong today**

- A property is found by its address and nothing else (`findProperties` in `src/lib/search-results.ts`). A model number off a water heater, the account number on a National Grid bill, or the loan number on a mortgage statement finds nothing.
- A contractor is found by name, company and trade. A number from a missed call finds no one, though the same number finds a tenant.
- A phone typed with parentheses, "(716) 555-0142", finds no tenant either: the words split into "(716)" and "555-0142", and "(716)" is in no field as stored.

**What changes**

- Search reads these, and only these, new values:
  - **Each unit:** equipment model number and equipment type; National Grid, National Fuel and water account fields (`nationalGridAcct`, `nationalFuelAcct`, `waterAcct`).
  - **Each property:** loan number, lender, loan servicer, insurance policy number, insurer.
  - **Each contractor:** phone and email.
- A result row that matched on one of them says so where its meta usually sits: "Upper · Water Heater RG240S6N".
- Opening it lands on the match: the property page scrolls to that unit with Equipment or Utilities open and the matched line tinted for a moment, or to the Loan or Insurance section.

Local data has 55 equipment items with a model number, and 26, 30 and 31 units with a National Grid, National Fuel and water value (11 properties, 31 units; production has more).

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What search reads beyond what Connor asked for | **Contractor phone and email; loan number, lender, servicer, policy number and insurer** (Connor, Nov 17). Not LLC owner or unit names, and not task descriptions, which pull in old tasks on common words |
| 2 | How a row shows a match on a field it doesn't show | **A, the match takes the meta's place**: "767 Prospect Ave · Upper · Water Heater RG240S6N", one line on laptop and tablet, line 2 on a phone (Connor, Nov 17). Not after the usual meta (B), where the number is what truncates, or a second line under the row (C) |
| 3 | Where a unit-level hit lands | **A, the property page scrolled to the unit**, its Utilities or Equipment open and the matched line tinted for about 2 seconds; loan and policy hits scroll to Loan or Insurance (Connor, Nov 17). Not the top of the page (B) or the unit's edit sheet (C) |
| 4 | Equipment by type as well as model number | **B, type words too, with everyday names**, so "prospect fridge" answers with the model (Connor, Nov 17). Not model numbers only (A) |

## 3. How words match

`lib/search.ts` keeps its rules for everything that matches today: every typed word must match some field, in any order, 6 words at most, 2 characters at least. The new fields add to each word's choices.

**Numbers** (model, utility account, loan, policy, phone)
- Read with case, spaces, dashes, dots, slashes and parentheses ignored on both sides: "9258618-10", "925861810" and "9258618 10" all find National Fuel 9258618-10. Kenmore's "253.64722406" is found as typed.
- A word counts against a number field only when it has a digit and at least 4 letters and digits. So "767" or "12" never pulls in every account with those digits, and a word like "tenant" never matches the utility fields that read "TENANT".
- The whole query also counts as one number, so "(716) 555-0142" and "253.64722406" match even though their pieces are short. A record is found when every word matches, or when the whole query matches one of its number fields.
- A number typed with leading zeros also finds one stored without them ("05487400" finds "Meter - 5487400").
- A utility field is matched as a whole, notes included, so the meter number inside "9291272-09 (Meter #740347)" finds that unit too.
- Phones match the digits of `phoneE164`, and `phone` in the form every stored US phone has ("716-853-9547", `readPhone`), read from the end and from the start: "8539547" is looked for as "853-9547". Contractors imported before `phoneE164` was written have only `phone` (none of the 23 on local data has `phoneE164`). The same rule applies to tenants, which fixes the parentheses miss above.

**Words** (equipment type, lender, servicer, insurer, contractor email)
- Lender, servicer and insurer match a substring of 3 characters or more; a contractor's email any substring, as a tenant's does.
- An equipment type matches when a word of it starts with the typed word (3 letters or more): "water" and "heat" find a Water Heater, "ate" doesn't.
- Everyday names for stored equipment types: fridge → Refrigerator, washer → Washing Machine, dryer → Drying Machine, stove and range → Oven, and "hot" and "tank" → Water Heater, so "hot water tank" works. Furnace, Boiler, HVAC and the rest match as stored (`EQUIPMENT_TYPES` in `src/lib/config.ts`).

**Never read:** lockbox codes and locations, autopay and LOFL fields, equipment comments and install years, unit labels on their own.

**Ranking** is unchanged (`rankRows`): live records first, then title match quality, then most recent. A hit that only matched a hidden field already sits at quality 4, so "prospect" puts addresses with Prospect first and model numbers containing it after.

## 4. The result row

`PropertySearchRow` and `ContractorSearchRow` gain the `matched` field search.md 2.10 reserved:

```ts
matched?: { unit: string | null; label: string; value: string; code: boolean; more: number };
```

- Set only when a typed word isn't in the title or the usual meta, so "767 prospect" keeps "4 units · HG Buffalo Holding 1 LLC".
- The meta then reads `unit · label value`, the value in `text-code` `--fg-2` when `code`, never the copy button (a button can't sit inside a link, search.md 2.4):

| Hit | Meta |
|---|---|
| Equipment | "Upper · Water Heater RG240S6N" (the type as the Units list prints it) |
| National Grid, National Fuel, water | "Upper · National Grid 1607524355", "Front · Buffalo Water Meter - 05179975" (the group names the Units list prints). A field holding several lines shows the line that matched |
| Loan, policy | "Loan 0012345678", "Policy 88-1203" |
| Lender, servicer, insurer | "Lender · Vontive", "Servicer · Fay Servicing", "Insurer · Erie" |
| Contractor | "Phone 716-555-0142", "Email · luis@ortiz.co" (as stored, `phone` before `phoneE164`) |

- A unit with no label drops the unit part. When the same match hits more units of the building, the row names the first in Units list order and the meta ends "· 2 more".
- One line: a matched row keeps its address whole (up to half the row) and the meta gives way, as the approved mock shows; other rows keep "title first". Inside the meta, a long unit name ("1st Front / Lower Front") truncates first, so the number that was typed stays in view; only a very long email truncates too.
- Below 480px the meta is line 2 as today, with the same order of giving way.
- The row's accessible text (`rowParts` `text` in `command-palette.tsx`) carries the same words.
- Recent rows never carry `matched`.

## 5. The landing

- The row's `href` names the line, never its value: `/properties/<id>?find=<unitId>.equipment.<n>` (the item's place in the unit's list), `?find=<unitId>.utilities.<field>`, or `?find=loanNumber` (also `lender`, `loanServicer`, `insurancePolicyNo`, `insuranceCarrier`). `<unitId>` is the unit's `id`, or its place (`unit-at-N`) for units saved before ids existed (all 31 local units today). `lib/find-target.ts` keeps the convention, apart from the search rules so the page's bundle stays small. A contractor hit opens the contractor page as now.
- A query parameter, not a hash: Next's same-page hash changes re-run no effect, so a hit on the property already open wouldn't land. `FindOnArrival` (beside the page, next to Missing info's `FillOnArrival`, the `?fill=` pattern it follows) reads `find` through `useSearchParams`, drops it from the address, opens the line's `<details>`, or asks the Loan or Insurance fold to show the row through a new `reveal` request (`RailFold`'s `reveal` prop, `revealPropertyField`), which opens no editor. It scrolls the line to the middle of the screen. The "2 more" units sit nearby, closed.
- The line (the equipment table row, the utility row or the rail row) takes the `--accent` ground, the menu-highlight fill, holds it about 2 seconds, then clears in `--dur-fast` as any color change does (brand guidelines 7). Under reduced motion it clears at once.
- A line deleted between the search and the click lands on nothing, quietly.

## 6. Data

- **No migration and no new table.** Prisma can't search inside the `units` JSON, so the property search adds one raw SQL query per search (`propertyKeyHits`): for each number word and type word, the ids of live properties where one allowed value (`jsonb_path_query` on each allowed path, folded on its own so values never run together) contains it, and the same for the loan and policy columns. Those ids join each word's `OR` as `{ id: { in: ids } }` (`everyTermMatches` gained a `more` callback for it), so the count and the "See all" total stay one rule. Lender, servicer and insurer are plain Prisma `contains`.
- The SQL's rules have a JS twin in `lib/search-keys.ts` (`foldNumber`, `typeMatches`, `lineHasProbe`), which the row's matched line and the route test's fake database use. Checked against the local database on Nov 17: 237 queries built from every model, account, LOFL and lockbox value, 0 differences.
- The portfolio is about 100 properties, so this is one small query behind the 180ms debounce. If the units list grows into the thousands, a stored search column written by the properties service replaces it.
- `PROPERTY_SELECT` already carries `units`; it adds the loan and insurance fields. `matched` is worked out in JS from the rows the pool fetched.
- The lists the palette opens agree with it: `/contractors?q=` uses the contractor matcher (`contractors/query.ts`), and `/tenants?q=` the tenant phone rule, so "Open in Contractors" lists what "See all" counted. Properties have no list search.

## 7. Reuse check

**Reused:** `searchTerms`, `everyTermMatches`, `escapeLike`, `rankRows`, `matchRanges` (`lib/search.ts`); `PROPERTY_SELECT` and the row builders (`lib/search-results.ts`); `UTILITY_GROUPS` names and `isAccountField` for labels; `EQUIPMENT_TYPES`; `liveRecord`; the shell's hash scroll (`app-shell.tsx`); the Units list's Utilities and Equipment disclosures (`edit-units.tsx`); `--accent`; the code look from search.md 2.4.

**Extended:** `PropertySearchRow` and `ContractorSearchRow` gain `matched` (reserved in search.md 2.10); `everyTermMatches` takes a `more` callback; the property, contractor and tenant where clauses gain the new fields; the palette's row meta (`rowParts`) prints `matched`, with `keepTitle`; `RailFold` takes `reveal`; the equipment rows, utility rows and five loan and insurance facts carry find ids.

**New:** `src/lib/search-keys.ts`: folding, the digit and length rule, the whole-query number, leading zeros, phone spellings, the everyday equipment names, and the found line (which unit and line matched), all pure and tested. `src/lib/find-target.ts`. The raw id query. `find-on-arrival.tsx` and its tint.

**References:** the matched field under a row: [Mesh](https://mobbin.com/screens/ae10cfe7-db64-4960-8217-c7cdd19ff3e5) and [Stripe Dashboard iOS](https://mobbin.com/screens/2ab0bd2c-69ba-4757-b393-8faaadb7f189) (already in search.md 2.14), [WRITER](https://mobbin.com/screens/b44fe1e6-91bf-4074-b0b1-ac394f263bd5) and [Notion](https://mobbin.com/screens/6573e834-dc7c-42e4-812f-be159ac1f887) (the matched snippet under each result). The landing tint: Mobbin had no screen of it, so it traces to GitHub's line links (`#L12` scrolls to the line and tints it) and Slack's jump to a message (scrolls there and tints it, then fades).

## 8. Build order

1. **Matcher** (`lib/search-keys.ts`, tests): folding, the 4-character digit rule, whole-query numbers, leading zeros, everyday names, `matchedField`.
2. **Server** (`lib/search-results.ts`, route tests): the raw id query, the new where branches for properties, contractors and tenants, `matched` on rows, the hash in `href`; `/contractors` and `/tenants` lists on the same rules.
3. **Palette row** (`command-palette.tsx`): the meta prints `matched`, including "· 2 more", in the row's text too.
4. **Landing** (`edit-units.tsx`, `edit-loan.tsx`, `edit-insurance.tsx`): open from the hash, the ids, the tint.
5. **Checks**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:devices` and `test:devices:dark`. By hand at 320, 375, 768, 1280x800 and 1920: "rg240", "prospect fridge", "9258618-10", "(716) 555-0142", a policy number; open each hit and watch it land.

About half a day of work.

## 9. Not in this spec

- LLC owner and unit names, task descriptions (decision 1), deal notes, document filenames, playbooks.
- A typo fallback and stored-accent folding (search.md 2.10, phase 5).
- The palette's empty-state hint stays "Search by address, name or task."; it fits at 320 and adding "account #" would wrap it.

## 10. Where the build differs from the plan

- **`?find=` instead of a hash** (section 5): a hash change on the page already open re-runs nothing in Next, so that hit wouldn't land.
- **The tint holds, then clears in 120ms** rather than fading over 2 seconds: the brand guidelines give color changes `--dur-fast`.
- **The water group is "Buffalo Water"**, as the Units list names it.
- **Phones also match the shown `phone` column**, since imported contractors have no `phoneE164`.
- **Email matches any substring**, as a tenant's does; with a 3-letter floor "luis@ortiz.co" couldn't be found by typing it, since "." splits words.
- **The matched row keeps its address whole and lets the unit name truncate first**, so it reads like the approved mock at 1280, 768, 375 and 320; with the default "title first" rule the address read "767 Pros…".
- **An independent review (Nov 20) found six bugs in the build, all fixed with tests:** typing "constructor" failed every search (an Object.prototype lookup); a number typed with a space could name another unit's line ("GM9S960603BN AA"); a hidden-field hit hid "Add as a deal" for a new address ("58 Water St"); a contractor phone typed with +1 showed no "Phone" line; picking the same hit twice landed nowhere (`?find=` is now dropped with a null history state, so Next syncs it); a very long matched value clipped without an ellipsis.
