-- Job links (docs/specs/contractor-job-emails.md, section 3, approved by Connor
-- on Nov 14): the buttons in a job email open that one job without a password.
--
-- JobLink keeps each link's SHA-256 (the token is only in the email), the job,
-- and whose it is: a contractor's EMAIL or CREW link, or a partner's STAFF link
-- (photos only). PortalSession gains onlyTaskId, set on a session a link
-- started: it opens that one job and nothing else, and goes with the job.
--
-- Additive only: a new table, a new enum and two nullable columns. Nothing is
-- altered, dropped, renamed or tightened, so the code in production runs on it
-- unchanged. It reaches production through `prisma migrate deploy` in the
-- production build's prebuild (scripts/prebuild.mjs), before `next build`.

CREATE TYPE "JobLinkKind" AS ENUM ('EMAIL', 'CREW', 'STAFF');

CREATE TABLE "JobLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "JobLinkKind" NOT NULL,
    "taskId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "JobLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobLink_tokenHash_key" ON "JobLink"("tokenHash");
CREATE INDEX "JobLink_taskId_idx" ON "JobLink"("taskId");
CREATE INDEX "JobLink_contactId_idx" ON "JobLink"("contactId");

ALTER TABLE "JobLink" ADD CONSTRAINT "JobLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobLink" ADD CONSTRAINT "JobLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobLink" ADD CONSTRAINT "JobLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortalSession" ADD COLUMN "onlyTaskId" TEXT;
ALTER TABLE "PortalSession" ADD COLUMN "jobLinkId" TEXT;
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_onlyTaskId_fkey" FOREIGN KEY ("onlyTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_jobLinkId_fkey" FOREIGN KEY ("jobLinkId") REFERENCES "JobLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every new table gets row-level security (README, Rules of the road). The app
-- reads it as the table owner, which RLS doesn't restrict; nothing else may.
ALTER TABLE "JobLink" ENABLE ROW LEVEL SECURITY;
