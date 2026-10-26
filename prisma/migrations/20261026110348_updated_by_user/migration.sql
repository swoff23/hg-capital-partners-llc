-- Who last changed a property or a deal (docs/specs/forms-editing.md 2.12 and
-- question 3, build plan section 1.1 rows 1 and 2). With it, a save that lost
-- a race names the person: "Pieter set this to $410,000 at 2:14 PM" instead
-- of "This changed". Every Property write in src/lib/properties/service.ts and
-- patchDeal and createDeal in src/lib/deals/service.ts set it.
--
-- Additive only: two nullable columns and their foreign keys. Nothing is
-- altered, dropped, renamed or tightened, so today's code runs on it and it
-- is safe on the existing production database whenever it is applied, by
-- prebuild's `prisma migrate deploy` or out of band through `npm run
-- migrate`, before or after the code that writes it ships. Nothing is
-- backfilled: existing rows stay null, and a conflict on one of them reads
-- "This changed to … at …" until someone saves it again.
--
-- ON DELETE SET NULL: removing a user keeps the property or deal and forgets
-- who touched it last. No index on the new columns: they're only read with
-- the row they sit on, and the tables are small (about 10 properties and 700
-- deals), so the delete's scan is cheap.
--
-- The schema comment on Deal.ourPrice now says what Connor confirmed: the
-- column is HG's target offer ("Target offer" in the UI). A comment only; the
-- column and the ourPrice sort key in URLs don't change.
--
-- No RLS line: no new table (README, Rules of the road).

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "updatedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
