-- Uploads, photos and files (docs/specs/uploads-photos.md question 2, a to c;
-- build plan section 1.1 rows 8 to 10). Three nullable additions:
--
-- PropertyAttachment.uploadedByUserId, FK to User: who added a property
-- document, so its row reads "Connor · Oct 3" like a task file (uploads 2.4).
--
-- Property.photoUrl and Property.photoPathname: the building's front photo on
-- public Blob (uploads 2.10), shown in Portfolio rows, the record header, the
-- contractor's job page and My jobs, search and the pickers. The pathname is
-- kept to delete the blob when the photo is replaced or removed.
--
-- TaskTemplate.finishPhotosRequired: how many photos a contractor's Mark done
-- asks for on a playbook's jobs (uploads 2.8, choice 5 A). Null or 0 means
-- optional, which every job stays until a playbook editor sets it.
--
-- Additive only: three tables gain nullable columns and one foreign key.
-- Nothing is altered, dropped, renamed or tightened, so the code already in
-- production runs on it unchanged. Nothing is backfilled: existing documents
-- stay null and show the date alone, no property has a photo until someone
-- sets one, and every playbook stays optional.
--
-- It must be in place before the code that ships with it serves a request.
-- That code needs the columns: Prisma names every column of a model in a
-- read that doesn't pick its own fields, so the property record page fails
-- without them, and search, the pickers, My jobs, a contractor's job page and
-- adding a property document name them outright. It reaches production
-- through `prisma migrate deploy` in the production build's prebuild
-- (scripts/prebuild.mjs), which runs before `next build`, so before the new
-- code serves. Prebuild runs it on a direct or session DATABASE_URL and skips
-- the transaction pooler. (`npm run migrate` is the spreadsheet import, not
-- this.)
--
-- ON DELETE SET NULL: removing a user keeps the document and forgets who
-- added it. No index on the new column: it's only read with the row it sits
-- on, and the table is small, so the delete's scan is cheap.
--
-- No RLS line: no new table (README, Rules of the road).

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "photoPathname" TEXT,
ADD COLUMN     "photoUrl" TEXT;

-- AlterTable
ALTER TABLE "PropertyAttachment" ADD COLUMN     "uploadedByUserId" TEXT;

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "finishPhotosRequired" INTEGER;

-- AddForeignKey
ALTER TABLE "PropertyAttachment" ADD CONSTRAINT "PropertyAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
