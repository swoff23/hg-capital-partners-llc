-- Maintenance requests (docs/specs/maintenance-requests.md): a tenant's own link,
-- what a resident sent beside the task it became, and their uploads waiting to attach.

-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN     "uploadedByTenantId" TEXT;

-- CreateTable
CREATE TABLE "ResidentLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT NOT NULL,
    "whatsWrong" TEXT NOT NULL,
    "details" TEXT,
    "letUsIn" BOOLEAN NOT NULL,
    "pets" BOOLEAN,
    "petsNote" TEXT,
    "closedNote" TEXT,
    "canceledByResidentAt" TIMESTAMP(3),
    "notifiedStep" TEXT NOT NULL DEFAULT 'received',
    "notifiedDay" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentUpload" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "thumbPathname" TEXT,
    "posterPathname" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResidentLink_tokenHash_key" ON "ResidentLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ResidentLink_tenantId_idx" ON "ResidentLink"("tenantId");

-- CreateIndex
CREATE INDEX "ResidentLink_leaseId_idx" ON "ResidentLink"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentRequest_taskId_key" ON "ResidentRequest"("taskId");

-- CreateIndex
CREATE INDEX "ResidentRequest_leaseId_idx" ON "ResidentRequest"("leaseId");

-- CreateIndex
CREATE INDEX "ResidentRequest_notifiedStep_idx" ON "ResidentRequest"("notifiedStep");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentUpload_pathname_key" ON "ResidentUpload"("pathname");

-- CreateIndex
CREATE INDEX "ResidentUpload_linkId_idx" ON "ResidentUpload"("linkId");

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedByTenantId_fkey" FOREIGN KEY ("uploadedByTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentLink" ADD CONSTRAINT "ResidentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentLink" ADD CONSTRAINT "ResidentLink_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentRequest" ADD CONSTRAINT "ResidentRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentRequest" ADD CONSTRAINT "ResidentRequest_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentRequest" ADD CONSTRAINT "ResidentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentUpload" ADD CONSTRAINT "ResidentUpload_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ResidentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A file has at most one uploader: a staff user, a contractor or a resident.
ALTER TABLE "TaskAttachment" DROP CONSTRAINT "TaskAttachment_one_uploader";
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_one_uploader"
  CHECK (num_nonnulls("uploadedByUserId", "uploadedByContactId", "uploadedByTenantId") <= 1);

-- RLS on every new table (see 20260901200000_enable_row_level_security for why
-- zero policies is right; src/lib/db-rls.test.ts enforces this).
ALTER TABLE "ResidentLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResidentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResidentUpload" ENABLE ROW LEVEL SECURITY;
