# Lockbox location and photo

This spec gives each unit a **Lockbox location** ("Back entrance") beside its Lockbox code, and a **lockbox photo** the contractor taps to see where the box is. It closes UI/UX review item G2C-037 and is the location and photo part of G1A-I05's "Getting in" block. It was planned with Connor on Nov 15, 2026, against `d4941ac`. He said "build it" the same day, and it was built to this spec; the one-off in section 3.7 still waits for his yes on production.

## 1. Summary

**What's wrong today**

- **The location hides inside the code.** Five units carry it in parentheses: 15 Oxford Lower "1924 (back entrance)", Upper "2925 (back entrance)", Attic "4857 (back left corner of the house)", and 23 Sherwood Lower and Upper "6385 (gate)". The Units list fakes a split (`splitLockbox` in `edit-units.tsx`), but the contractor's job page shows the whole string as the code, and a tap copies "1924 (back entrance)".
- **A sentence can't say where a box is as well as a photo can.** "Back left corner of the house" still leaves a contractor walking the yard. Connor, Nov 15: "give us the ability to take a picture of the lockbox so the contractor can click to see the actual lockbox location itself", and it must be there "for the contractor to see when they open up the job".

**What changes**

- Each unit gets three lockbox fields: **Code**, **Location** (one optional line) and **Photo** (one optional photo). A blank location or photo stays blank and nothing shows for it (Connor, Nov 15).
- The contractor's job page shows the location and the photo in the Lockbox section, under the same rule as the code (D21): only the assigned contractor, only while the job is open.
- Staff add the photo from the unit sheet, with the camera on a phone or a file on a laptop.
- A **Same lockbox for all units** checkbox in the unit sheet: when it's on, one code, location and photo serve every unit at the property, entered once. It starts on for the 8 buildings whose units already share one code (23 Sherwood's Lower and Upper, both 6385 on the gate, among them).
- The five values above split into code and location, once, on local and then production.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How the job page shows the location and photo | **A, the photo as a thumbnail beside the code, the location under it; a tap on the photo opens it full screen** (Connor, Nov 15: "A but they can click the photo and it makes it bigger"). Not a full-width photo (B) or a "See photo" link (C) |
| 2 | Where the fields sit in the unit sheet | **C, a "Lockbox" section with the photo tile on the left and Code over Location on the right; the tile runs from the top of Code's label to the bottom of the Location field** (Connor, Nov 15, from a screenshot of the mockup: "C, but lockbox isnt optional, also make the photo go all the way to the bottom of the location field"). Not a section with the tile under the fields (A) or today's top row with Location under it (B) |
| 2b | Is a code required to save a unit? | **No. Only "(optional)" leaves the heading** (Connor, Nov 15: "B, heading only"). Code and Location each keep their own "optional" tag, so 415 Crescent's Units 1, 2, 3, 5 and 6, which have no code, still save. Not a required code (A) |
| 3 | How the Units list row shows them | **B, the first line as today; the line under it reads the location, then "· Photo" when there is one** (Connor, Nov 15: "b"). A tap on Photo opens it full screen. Not a thumbnail beside the code (A) or the location alone (C) |
| 4 | Units that share a code | **Shared, entered once** (Connor, Nov 15: "A, same code, same box"). How it's shared is decision 4b. Not each unit on its own with no way to share (B) or borrowed without showing in the sheet (C) |
| 4b | How units say they share a lockbox | **A "Same lockbox for all units" checkbox in the unit sheet, under the Lockbox row** (Connor, Nov 15: "I'd give a checkbox somewhere so we can say 'same lockbox for all units'", then "A, in the unit sheet"). Not on the Units list header with one lockbox row (B). The checkbox replaces decision 4's same-code matching, so there is one rule you can see; Connor didn't keep both when asked |

Defaults taken without a separate question (Connor can overrule any of them):

- **Location and photo ride with the code.** They show exactly when the code shows: D21 today, and the Permission to enter rule when tenants part 2 lands (`tenant-contact.md` Q21). With no code, there is no Lockbox section, even if a location or photo is on file.
- **Staff add and change the photo; contractors only see it.** A wrong photo would mislead every later contractor, so it isn't theirs to set. Picking a photo a contractor already took on a job ("Choose from photos taken here", as the building photo offers) is a possible follow-up, not in this spec.
- **One photo per unit.** A second photo of the same box adds a swipe nobody needs.
- **The location is shown as typed**, one line, up to 80 characters, after a map pin icon. No "Lockbox at" prefix, so "On the gate" and "Back entrance" both read right.
- **Crew texts and job emails don't change.** Neither carries the code today; their link opens the job, where the code, location and photo show together. The location alone at the door is half the answer.
- **The staff task page's Lockbox row doesn't change.** It keeps the code and "Shown to Zack". Tenants part 2 replaces the row with Access (`tenants.md`, "Today's Lockbox row"), and the property page already shows the full unit.
- **No new security event.** The photo only shows when the code shows, and the job page view is already logged as `LOCKBOX_VIEWED`.

## 3. Behavior

### 3.1 Data

`PropertyUnit` (`src/lib/property-types.ts`) gains two keys on the `Property.units` JSON. No migration.

```ts
lockboxLocation?: string | null;   // "Back entrance". One line, 80 characters at most
lockboxPhoto?: {
  pathname: string;                // private Blob, properties/<id>/lockbox/<random>.jpg
  thumbPathname: string | null;    // about 1024px, for the thumbnails
  width: number | null;
  height: number | null;
} | null;
```

- `writeUnitsAt` (`src/lib/properties/service.ts`) whitelists both: the location trimmed and null when blank; the photo kept only when its pathnames sit inside that property's lockbox folder (`isLockboxPhotoPath`, beside `isPropertyPhotoPath` in `src/lib/properties/photo.ts`).
- The units action schema (`src/app/(app)/properties/actions.ts`) adds `lockboxLocation: z.string().max(80).nullish()` and the photo object.
- `lockboxCode` keeps its free text. It gets no digits-only rule, since some boxes use letters.
- **Same lockbox for all units (decision 4b)** is a third key, `lockboxShared?: boolean`, written on every rentable unit of the property at once (house-meter rows, `isHouseMeterRow`, never carry it). The checkbox reads on when any rentable unit carries it. No column, so no migration.
- Saving a unit with the box on copies its code, location and photo to every other rentable unit and sets `lockboxShared` on all of them, in the same transaction. Saving with it newly off clears `lockboxShared` on all of them and leaves every unit's values as they are; from then on each unit is edited on its own. A pure `applySharedLockbox(units, unitId, shared)` in `property-types.ts` does both, with tests.
- A unit added while the box is on takes the shared code, location and photo (the new-unit sheet opens with them filled in and the box on).
- With the box off, units never share, even when their codes match. 118 Congress (2nd Floor and Front on 1181, Rear on 2374) enters 1181's location and photo on both units.

### 3.2 The unit sheet (decision 2)

Decided (C), in `unit-sheet.tsx`:

- **Name** alone on the first row.
- A **Lockbox** section, the same `Section as="h3"` as "Utilities (optional)" and "Equipment (optional)", titled "Lockbox" with no "(optional)" (Connor, Nov 15).
- Inside, a two-column row at every width: the **photo tile** on the left, 96px wide, and **Code** over **Location** on the right, taking the rest. Both fields keep `FormField`'s `optional` tag and nothing is required (decision 2b). Location's placeholder is "Back entrance".
- The tile's top lines up with the top of Code's label and its bottom with the bottom of the Location field (`self-stretch` against the fields column), so the two edges line up exactly at 1280, 768, 375 and 320. Empty, it is a dashed box with a camera icon over "Add photo". With a photo, the photo fills it (`object-cover`).
- On a phone the tile offers the camera or the library, as every `useMediaUploader` picker does. Once set, a tap opens a menu: View, Replace photo, Remove photo.
- At 320 the fields column is about 180px wide; a long location scrolls inside its input rather than wrapping.
- Under the Lockbox row, a **Same lockbox for all units** `Checkbox` (decision 4b), with one helper line in `text-meta` under its label:
  - On, and the other units already match: "Lower uses it too", or "The other 2 units use it too" with more than one (767 Prospect has three units).
  - Being turned on where other units differ, in the warning tone: "Replaces the codes on Lower and Attic" (15 Oxford), or "Replaces the codes on 3 other units" past two names, so it stays one line. The save is the commit; nothing changes until **Save unit**.
  - Off: no helper line.
- The checkbox hides on a property with one rentable unit, where there is nothing to share.
- The photo goes up as soon as it's picked and is saved with **Save unit**. Closing the sheet without saving deletes the upload, as listing photos do (`discardListingUploads`).

At 1280 and 768 the sheet is the `lg` FormSheet; the Lockbox row keeps the same shape at every width, only narrower.

### 3.3 The Units list (decision 3)

Decided (B), in `edit-units.tsx` `UnitRow`:

- First line exactly as today: name, "Lockbox" (hidden under 480px), the code (`Code`, copies on a tap), the ⋯ menu.
- Second line, when the unit has a location or a photo, in `text-meta` `--muted-foreground`: a map pin, the location as typed, then " · " and **Photo** when there is one. Today's "Lockbox at back entrance" line becomes this.
- **Photo** is a text button styled as `TextLink` (`--foreground` with its underline, since it sits in a line of muted text; named "Open lockbox photo for Upper" for screen readers) that opens the `Lightbox` full screen. It never truncates; the location truncates before it, so at 375 and 320 "Back left corner of… · Photo" stays one line. It gets a 44px hit area on touch without the line growing, as `Code` does.
- A photo with no location: the line reads "Lockbox photo", the same button. No location and no photo: no second line.
- `splitLockbox` goes away: the row reads the fields.

### 3.4 The contractor's job page (decision 1)

Decided (A), in `job-details.tsx` `LockboxSection`:

- The code, large, as today (`Code size="lg"`, no copy icon).
- Beside it on the right, the **photo thumbnail**, 96x72 on a phone, 4:3, `rounded-md`, a button named "Open lockbox photo". A tap opens the `Lightbox` full screen, titled "Lockbox photo" over the location, with pinch and double-tap zoom as every photo has. A swipe down or Close goes back to the job.
- Under the code, the **location** after a map pin, in `text-body` `--foreground`, wrapping if it must.
- No photo: the code and location only. No location: the code and photo only, with no location line (Connor, Nov 15: "if we didnt include a location, then there shouldnt be a location field").
- A photo on file whose image won't load (the file is gone from storage) shows no tile either, never an empty box (Connor, Nov 15: "if a photo is missing/not uploaded then there shouldn't be a photo on the contractor view"). A photo that didn't finish uploading is never saved to the unit, so it can't reach the job page. Staff still see the empty tile in the unit sheet, so they know to replace it.
- Same block at 1280, 768 and 375. At 320 the code and thumbnail still share the row (a 4-digit code at `text-code-l` is about 70px).

### 3.5 What doesn't change

- **Crew text** (`src/lib/portal/crew-text.ts`): "Lockbox, photos, updates:" and the link, as today.
- **Job emails**: the "Show access" button still opens the job at `#lockbox`.
- **Staff task rail**: the Lockbox row as today.
- **Comment masking** (`lockboxMasker`): it masks codes, as today. A location isn't secret.
- **The resident move-in page**: unit labels only, as today.

### 3.6 Who sees the photo, and how it's served

- New upload kind `lockbox-photo-upload` (`src/lib/attachments/upload-kinds.ts`): staff only, **private** Blob, photos only, prepared as `display` (upright, a 2560px JPEG, **no metadata**, so a phone photo's GPS never goes up) plus a thumbnail.
- The gated files route (`src/app/api/files/[kind]/[id]/route.ts`) gains two kinds:
  - `lockbox`, id = the task: staff, and the contractor the job resolves for, under the same checks the code gets in `queries.ts` (assigned, job open) and the job-link token (`?l=`, that job only). The route asks `access-code.ts` which unit's photo the job shows, so a contractor never gets another unit's photo.
  - `property-lockbox`, id = the property, `?p=<pathname>`: staff only, for the Units list and the sheet. It serves any file inside that property's lockbox folder (`isLockboxPhotoPath`), so the sheet can show a photo uploaded before Save.
- `access-code.ts` stays the one portal file that reads `Property.units` (`auth-guard.test.ts`). `pickLockboxCode` becomes `pickLockboxAccess`, returning `{ code, location, hasPhoto }` for one unit, never the list. `pickLockboxCode` and `readLockboxCode` stay as thin wrappers for the callers that only need the code (job emails, crew texts).
- With no unit on the job and one shared code (D21), the location and photo come from the units carrying that code, which the checkbox keeps in agreement when it's on. With it off and two units on the same code with different locations or photos, the first unit in list order that has one wins.
- A replaced or removed photo's files are deleted after the save, unless another unit still points at them (a shared lockbox puts one photo on every unit).

### 3.7 Migrating today's values

A one-off script, `scripts/migrate/lockbox-locations.ts`, dry run by default:

- For every unit whose `lockboxCode` reads "code (words)" and has no location, it sets the code to the part before the parentheses and the location to the words, first letter capitalized. It writes through `replaceUnits`, so the save rules and version check apply.
- It prints every change before and after. Expected on production:

| Property | Unit | Code | Location |
|---|---|---|---|
| 15 Oxford Ave. | Lower | 1924 | Back entrance |
| 15 Oxford Ave. | Upper | 2925 | Back entrance |
| 15 Oxford Ave. | Attic | 4857 | Back left corner of the house |
| 23 Sherwood St | Lower | 6385 | On the gate |
| 23 Sherwood St | Upper | 6385 | On the gate |

- "gate" becomes "On the gate" by hand (Connor, Nov 15: the lockbox is on the gate). The local DB still has the "entrace" typo on 15 Oxford Upper; the script fixes it there too.
- It also turns **Same lockbox for all units** on for every property whose rentable units all carry one non-blank code. Expected on production, 8 buildings: 23 Sherwood, 428 Normal, 58 Mariner, 647 Prospect, 725 Linwood, 765 Prospect, 767 Prospect and 933 Lafayette. 15 Oxford (three codes), 118 Congress (two) and 415 Crescent (only Unit 4 has a code) stay off.
- It runs on local first, then on production with Connor's yes.
- `scripts/migrate/01-properties.ts` splits the same way, through the same function, so a re-import can't put the parentheses back.

### 3.8 Mockups

- [01-job-page.svg](lockbox-location/01-job-page.svg): decision 1, the Lockbox section and the photo opened full screen.
- [02-unit-sheet.svg](lockbox-location/02-unit-sheet.svg): decisions 2, 2b and 4b, the sheet's Lockbox section and the checkbox.
- [03-units-list.svg](lockbox-location/03-units-list.svg): decision 3, the Units list rows.

## 4. Reuse check

**Reused as is**

- `Code` (`src/components/code.tsx`) for the code everywhere it shows today.
- `Lightbox` (`src/components/lightbox.tsx`) for the full-screen photo, zoom included.
- `useMediaUploader` and the `display` prepare mode (`src/lib/attachments/prepare.ts`): camera or library, HEIC to JPEG, no metadata, thumbnail.
- `FormSheet`, `FormField`, `Input`, `Section`, `Checkbox` (`ui.tsx`) and the sheet's `FieldGrid` in `unit-sheet.tsx`.
- `Menu` for the photo tile's View, Replace and Remove, as `property-photo.tsx` uses it.
- The gated files route's viewer checks and `assertContractorAccess`.
- `replaceUnits` / `saveUnit` / `writeUnitsAt` for every write, the version check included.

**Extended**

- `PropertyUnit` with `lockboxLocation`, `lockboxPhoto` and `lockboxShared`; `writeUnitsAt`'s whitelist; the units action schema; `saveUnit` applies the shared lockbox.
- `access-code.ts`: `pickLockboxAccess` and `readLockboxAccess` beside the code-only wrappers. `src/lib/tasks/lockbox.ts` is unchanged, since the staff task rail still shows the code alone.
- `LockboxSection` (`job-details.tsx`) with the thumbnail and the location line.
- `UnitRow` (`edit-units.tsx`): its second line reads the location field and gains the Photo button.
- `upload-kinds.ts`, `limits.ts` and the Blob token route with `lockbox-photo-upload`; the files route with `lockbox` and `property-lockbox`.
- `photo.ts` with `isLockboxPhotoPath`, `recordLockboxPhoto` and `discardLockboxUploads`; `photo-actions.ts` with their two actions.

**New**

- `applySharedLockbox` (pure, decision 4b) and the `lockboxShared` key.
- `scripts/migrate/lockbox-locations.ts`.
- `lockbox-photo.tsx` (the sheet's tile, `LockboxPhotoField`) and `lockbox-photo-viewer.tsx` (`LockboxPhotoViewer`, `lockboxPhotoUrl`) beside the property page. Feature-only compositions of `useMediaUploader`, `Menu` and `LazyLightbox`, after `property-photo.tsx`'s tile and the listing sheet's upload-before-Save, so they get no row in `docs/components.md`.
- `sharedLockboxLine` in `src/lib/properties/unit-sheet.ts`, the checkbox's one line.

## 5. References

- [Walmart, Delivery instructions](https://mobbin.com/screens/18f5a5a1-a70a-4f9c-86e4-48a0843148c0): "Gate or call box code" is its own field, apart from the notes. The code stays clean to copy.
- [Uber Eats, Dropoff options](https://mobbin.com/screens/3f9b767e-8f6a-4e02-80a3-e58f4ecb8c0a): the instructions with one photo thumbnail beside them, for the driver at the door.
- [Keeta, Delivery address](https://mobbin.com/screens/4bd990f1-ce77-480f-9f9f-59a21fde3c4d): asks for "a photo of the building or entrance/gate" so the courier finds it.
- [CLEAR, Terminal guide](https://mobbin.com/screens/efc81fab-2f87-459e-9b46-65c9807284e0): a photo with a one-line direction under it.
- [Airbnb, optional instructions](https://mobbin.com/screens/bd0bc8cd-1274-4711-88fd-20e67901e8c9): "How to get inside" written once by the host for every guest.
- [Postmates PIN](https://mobbin.com/screens/1a682178-2bc8-4fa2-942d-784f5463333d) (from G1A-020): the code in large digits, readable at a glance.

## 6. Checks

- Unit tests: `writeUnitsAt`'s whitelist keeps the new keys and drops a photo outside the property's folder; `applySharedLockbox` (turning on copies to every rentable unit and skips house-meter rows, turning off keeps the values, a new unit joins); `pickLockboxAccess` for a unit, no unit with one shared code, and two codes; the migration's split, the typo and the hand-set "On the gate".
- `auth-guard.test.ts` still finds `Property.units` read only in `access-code.ts` among portal files.
- Files route: a contractor gets the photo for their own open job only; a closed job, another contractor, another unit and `property-lockbox` are refused, and a path outside the property's lockbox folder is refused to staff too.
- `npm run test:devices`, then the sheet, the Units list and the job page by hand at 375 and 320, with and without a photo and a location, and the Lightbox opened from each.
