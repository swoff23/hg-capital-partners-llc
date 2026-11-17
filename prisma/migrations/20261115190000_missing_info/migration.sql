-- Missing info (docs/specs/missing-info.md). The gaps are computed from the
-- records on each read and never stored. This adds the two things that are:
--
-- 1. "MissingInfoSkip": a partner's "Doesn't apply" on one check for one
--    record (D3), with who and when, so the worklist's fold can say
--    "Connor · Nov 15" and Undo can remove it. src/lib/missing/service.ts is
--    the only writer.
-- 2. "TaskChecklistItem"."checkKey": the missing-info row a Make task item
--    stands for (D9), so the item ticks itself once the row is filled in.
--
-- Additive only: a new table, a nullable column and two indexes. Nothing is
-- altered, dropped, renamed or tightened, so today's code runs on it and it
-- is safe on production before or after the code that writes it ships.
--
-- RLS on, with no policies, as every table in `public` (README, Rules of the
-- road). Never FORCE.

-- CreateTable
CREATE TABLE "MissingInfoSkip" (
    "id" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissingInfoSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MissingInfoSkip_check_subject_key" ON "MissingInfoSkip"("check", "subject");

-- CreateIndex
CREATE INDEX "MissingInfoSkip_subject_idx" ON "MissingInfoSkip"("subject");

-- AddForeignKey
ALTER TABLE "MissingInfoSkip" ADD CONSTRAINT "MissingInfoSkip_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TaskChecklistItem" ADD COLUMN "checkKey" TEXT;

-- CreateIndex
CREATE INDEX "TaskChecklistItem_checkKey_idx" ON "TaskChecklistItem"("checkKey");

-- Row level security
ALTER TABLE "MissingInfoSkip" ENABLE ROW LEVEL SECURITY;
