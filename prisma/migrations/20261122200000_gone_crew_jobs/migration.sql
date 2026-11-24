-- A deleted job's crew link and open crew page (docs/specs/emails-redesign.md, Q7): "This job is canceled. No need to
-- go." with the title and street, where today a delete leaves the link nothing to read and it goes to sign in.
--
-- "GoneCrewJob": one row per CREW job link and per live crew session of a job deleteTask removes, keyed by that
-- token's SHA-256 (never the token), with only the words the page shows. No foreign keys: the job is gone. Rows are
-- never read past "expiresAt" (30 days after the delete, or the session's own end if sooner), and each delete purges
-- the expired ones (src/lib/portal/gone-crew-jobs.ts, the only writer).
--
-- All additive, so today's code runs on this schema. The new table enables RLS here (src/lib/db-rls.test.ts).

-- CreateEnum
CREATE TYPE "GoneCrewJobKind" AS ENUM ('LINK', 'SESSION');

-- CreateTable
CREATE TABLE "GoneCrewJob" (
    "tokenHash" TEXT NOT NULL,
    "kind" "GoneCrewJobKind" NOT NULL,
    "title" TEXT NOT NULL,
    "street" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoneCrewJob_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "GoneCrewJob_expiresAt_idx" ON "GoneCrewJob"("expiresAt");

-- Supabase serves the public schema over PostgREST: lock the table.
ALTER TABLE "GoneCrewJob" ENABLE ROW LEVEL SECURITY;
