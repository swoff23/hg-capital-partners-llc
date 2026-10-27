-- Activity and comments on deals (docs/specs/activity-comments.md 2.9 and
-- question 1; build plan section 1.1 rows 3 to 6). Four additions to DealNote:
--
-- authorUserId, FK to User: who wrote the note, so the deal's Activity names
-- its author instead of the initials or "  ·  Connor Swofford" pasted into
-- the text today (DEALS-044). New notes write it; old notes get it from
-- scripts/backfill-deal-note-authors.ts (dry run by default, run by hand
-- after landing, never from this file).
--
-- data, JSONB default '{}': a change entry's field, old value and new value
-- ({ field, from, to }), so a burst reads "Connor changed the price and 2
-- other fields" and opens into old and new rows. A constant default, so the
-- add is a catalog change and doesn't rewrite the table.
--
-- editedAt and deletedAt: editing and deleting your own notes, deletedAt as
-- a soft delete so the toast's Undo can bring the note back.
--
-- Additive only: nullable columns, one constant default and one foreign key.
-- Nothing is altered, dropped, renamed or tightened, so the code already in
-- production runs on it unchanged. Nothing is backfilled here: every
-- existing note keeps a null author, an empty data object and no edit or
-- delete time.
--
-- It must be in place before the code that ships with it serves a request.
-- That code needs the columns: Prisma names every DealNote column in what it
-- writes and reads back, so logDeal (core.ts) fails without them, and so
-- does every task write that logs to a deal, setStatus's Approve and Done
-- among them. It reaches production through `prisma migrate deploy` in the
-- production build's prebuild (scripts/prebuild.mjs), which runs before
-- `next build`, so before the new code serves. Prebuild runs it on a direct
-- or session DATABASE_URL and skips the transaction pooler. (`npm run
-- migrate` is the spreadsheet import, not this.)
--
-- Roll forward only once code that writes these columns has shipped.
--
-- ON DELETE SET NULL: removing a user keeps the note and forgets its author.
-- No index on the new column: it's read only with the row it sits on.
--
-- No RLS line: no new table (README, Rules of the road).
--
-- TaskEventKind's REPEAT value is in the next migration, on its own, since
-- Postgres can't use an enum value in the transaction that adds it (55P04).

-- AlterTable
ALTER TABLE "DealNote" ADD COLUMN     "authorUserId" TEXT,
ADD COLUMN     "data" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "DealNote" ADD CONSTRAINT "DealNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
