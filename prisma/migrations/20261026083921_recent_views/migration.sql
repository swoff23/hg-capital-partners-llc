-- Recently viewed records, for Recent in the command palette (docs/specs/
-- search.md 2.5 and 2.10, build plan section 1.1 row 11). Kept on the server
-- so Connor's laptop and phone share one list. src/lib/recent-views.ts is the
-- only writer: it upserts on (userId, kind, recordId), bumps viewedAt and
-- keeps the newest 20 per user and kind.
--
-- Additive only: a new enum and a new table. Nothing existing is altered,
-- dropped, renamed or tightened, so today's code runs on it and it is safe on
-- the existing production database whenever it is applied, by prebuild's
-- `prisma migrate deploy` or out of band through `npm run migrate`, before or
-- after the code that writes it ships. Nothing is backfilled: the table
-- starts empty and fills as people open records.
--
-- recordId has no foreign key on purpose. It points at a Property, Deal,
-- Task or Contact by kind, so readers skip records deleted since. Deleting a
-- User deletes their rows (ON DELETE CASCADE).
--
-- RLS on, with no policies, as every table in `public` (README, Rules of the
-- road; 20260901200000_enable_row_level_security). Never FORCE: the app
-- connects as the table owner, and FORCE with no policies would hide every row
-- from it. src/lib/db-rls.test.ts checks both.

-- CreateEnum
CREATE TYPE "RecentKind" AS ENUM ('PROPERTY', 'DEAL', 'TASK', 'CONTACT');

-- CreateTable
CREATE TABLE "RecentView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RecentKind" NOT NULL,
    "recordId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecentView_userId_viewedAt_idx" ON "RecentView"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentView_userId_kind_recordId_key" ON "RecentView"("userId", "kind", "recordId");

-- AddForeignKey
ALTER TABLE "RecentView" ADD CONSTRAINT "RecentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security
ALTER TABLE "RecentView" ENABLE ROW LEVEL SECURITY;
