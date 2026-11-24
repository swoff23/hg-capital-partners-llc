-- A resident email's own reply address (docs/specs/tenant-welcome-email.md, Q2): r+<token>@ on the sending domain,
-- one per email, the token kept only as its SHA-256 as job links are. Its own token, never the form link's, so a
-- reply address can't open the form. "requestId" is the request the email was about; null on the form email.
-- A reply posts on that request as the resident's own addition, or goes to both partners (src/lib/email/reply-sender.ts).
--
-- Additive, so today's code runs on this schema. The new table enables RLS here (src/lib/db-rls.test.ts).

-- CreateTable
CREATE TABLE "ResidentReplyAddress" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentReplyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResidentReplyAddress_tokenHash_key" ON "ResidentReplyAddress"("tokenHash");

-- CreateIndex
CREATE INDEX "ResidentReplyAddress_tenantId_idx" ON "ResidentReplyAddress"("tenantId");

-- CreateIndex
CREATE INDEX "ResidentReplyAddress_leaseId_idx" ON "ResidentReplyAddress"("leaseId");

-- CreateIndex
CREATE INDEX "ResidentReplyAddress_requestId_idx" ON "ResidentReplyAddress"("requestId");

-- AddForeignKey
ALTER TABLE "ResidentReplyAddress" ADD CONSTRAINT "ResidentReplyAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentReplyAddress" ADD CONSTRAINT "ResidentReplyAddress_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentReplyAddress" ADD CONSTRAINT "ResidentReplyAddress_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ResidentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Supabase serves the public schema over PostgREST: lock the table.
ALTER TABLE "ResidentReplyAddress" ENABLE ROW LEVEL SECURITY;
