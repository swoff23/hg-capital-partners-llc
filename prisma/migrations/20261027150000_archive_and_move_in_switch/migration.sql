-- Archive for deals, properties and contractors, and a "Show on move-in form"
-- switch per property (approved by Connor on Oct 27).
--
-- archivedAt and archivedByUserId on Deal, Property and Contact: an archived
-- record leaves every list, count, total, Home, search, the command palette
-- and the pickers, keeps its history, and comes back with Restore, which
-- clears both. Only the archive service writes them (src/lib/archive.ts,
-- called from each domain's service.ts). Contact.active is left alone: it is
-- the portal's sign-in gate, and an inactive contractor still lists and
-- searches, so it doesn't mean archived.
--
-- showOnMoveInForm on Property, default false: the public move-in form
-- (/residents/moving-in) offers a property only while it is on and the
-- property isn't archived. New properties start off. The UPDATE below turns
-- it on for every property the form lists today, so the form offers the same
-- buildings the day this ships: not a flip (by strategy or status), not Sold,
-- and not the test property "QA Test Oct27 Portfolio 1 Apt 4b". Strategy and
-- status are compared trimmed and in any case, as the page compared them; the
-- test property's address by its letters and digits alone, so a comma or a
-- town after it still matches.
--
-- Additive only: nullable columns, one boolean with a constant default, their
-- foreign keys and one UPDATE of the new column. Nothing is altered, dropped,
-- renamed or tightened, so the code in production runs on it unchanged.
--
-- It must be in place before the code that ships with it serves a request:
-- that code reads and writes the new columns on every deal, property and
-- contractor query. It reaches production through `prisma migrate deploy` in
-- the production build's prebuild (scripts/prebuild.mjs), which runs on
-- DATABASE_URL before `next build`, so before the new code serves. (`npm run
-- migrate` is the spreadsheet import, not this.)
--
-- ON DELETE SET NULL: removing a user keeps the archived record and forgets
-- who archived it. No index on the new columns: the tables are small (about
-- 700 deals, a dozen properties, a few dozen contractors).
--
-- No RLS line: no new table (README, Rules of the road).

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedByUserId" TEXT,
ADD COLUMN     "showOnMoveInForm" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The properties the move-in form lists today (the rule it replaces, from
-- src/app/(marketing)/residents/moving-in/page.tsx before this change).
UPDATE "Property"
SET "showOnMoveInForm" = true
WHERE lower(btrim(coalesce("strategy", ''), E' \t\r\n')) <> 'flip'
  AND lower(btrim(coalesce("status", ''), E' \t\r\n')) NOT IN ('flip', 'sold')
  AND regexp_replace(lower("address"), '[^a-z0-9]', '', 'g') NOT LIKE 'qatestoct27portfolio1apt4b%';
