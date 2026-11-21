-- Coming soon rentals and a sign-up list (docs/specs/coming-soon.md 3.1).
--
-- Additive only: one enum value and one table. Nothing is altered, dropped,
-- renamed or backfilled.
--
-- 1. "ListingStatus" gains COMING_SOON. No statement here uses the new value:
--    Postgres refuses a value added in the same transaction (55P04).
--    Its place is deliberate: BEFORE 'LEASED', where a plain ADD VALUE would
--    append it after HIDDEN. The Rentals page orders by status ascending, so
--    this keeps coming-soon homes after the available ones and before the
--    leased ones.
-- 2. "ListingWaitlistEntry": someone who signed up to hear about a listing,
--    one row per email per listing. The unique index leads with "listingId",
--    so it serves the listing's reads too. Deleting a listing deletes its list.
--
-- RLS on, with no policies, as every table in `public` (README, Rules of the
-- road). The app reads it as the table owner, which RLS doesn't restrict;
-- nothing else may. Never FORCE.
--
-- Roll forward only. An older build can't read a COMING_SOON row, so once one
-- is saved there's no going back to the code before this.

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'COMING_SOON' BEFORE 'LEASED';

-- CreateTable
CREATE TABLE "ListingWaitlistEntry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingWaitlistEntry_listingId_email_key" ON "ListingWaitlistEntry"("listingId", "email");

-- AddForeignKey
ALTER TABLE "ListingWaitlistEntry" ADD CONSTRAINT "ListingWaitlistEntry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security
ALTER TABLE "ListingWaitlistEntry" ENABLE ROW LEVEL SECURITY;
