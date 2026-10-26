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
-- Nothing is altered, dropped, renamed or tightened, so today's code runs on
-- it and it is safe on the existing production database whenever it is
-- applied, by prebuild's `prisma migrate deploy` or out of band through `npm
-- run migrate`, before or after the code that reads it ships. Nothing is
-- backfilled: existing documents stay null and show the date alone, no
-- property has a photo until someone sets one, and every playbook stays
-- optional.
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
