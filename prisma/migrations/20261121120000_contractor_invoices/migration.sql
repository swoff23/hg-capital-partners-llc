-- Contractor invoices (docs/contractor-invoices-plan.md, 5.1).
--
-- Additive only: five enums, five tables and one nullable column. Nothing is
-- altered, dropped, renamed or backfilled; no invoice exists yet.
--
-- 1. "Invoice": one contractor invoice, To review, To pay, Paid, or Not an
--    invoice (a soft delete). Money is DECIMAL(12,2). "duplicateOfId" points
--    at an older invoice it may repeat (M10), kept by src/lib/invoices/core.ts.
-- 2. "InvoiceTask": the jobs it's for. Deleting a job sets "taskId" null and
--    keeps the title it had, so the invoice and its link survive the job.
-- 3. "InvoiceFile": the invoice's own private Blob copy of each file, with the
--    SHA-256 of its bytes.
-- 4. "InvoiceEvent": its history. Actor ids are nullable; the label is not.
-- 5. "InboundEmail": a received email as it came in, once per Resend id.
--    Generic, for the other inboxes planned on the same webhook. "fromLine"
--    keeps the raw From header beside the bare address, for the single
--    address check (M11, M12).
-- 6. "NotificationOutbox"."invoiceId": the Paid email's invoice. Null on every
--    row today, and today's drain never reads it.
--
-- The CHECKs below are rules Prisma can't express. Each holds on an empty
-- table, so none can fail here.
--
-- RLS on every new table, with no policies, as every table in `public`
-- (README, Rules of the road). The app reads them as the table owner, which
-- RLS doesn't restrict; nothing else may. Never FORCE.
--
-- Roll forward only. Today's code never reads these tables, so it runs on
-- this schema unchanged.

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('PORTAL', 'REPLY', 'EMAIL', 'STAFF');

-- CreateEnum
CREATE TYPE "InvoiceStage" AS ENUM ('REVIEW', 'TO_PAY', 'PAID', 'NOT_INVOICE');

-- CreateEnum
CREATE TYPE "InvoicePayMethod" AS ENUM ('BASELANE', 'CHECK', 'ZELLE', 'VENMO', 'CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceEventKind" AS ENUM ('ARRIVED', 'EDITED', 'FILE_ADDED', 'APPROVED', 'REOPENED', 'PAID', 'UNDONE', 'NOT_INVOICE', 'RESTORED');

-- CreateEnum
CREATE TYPE "InboundEmailStatus" AS ENUM ('RECEIVED', 'FILED', 'IGNORED', 'OVER_CAP');

-- AlterTable
ALTER TABLE "NotificationOutbox" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "source" "InvoiceSource" NOT NULL,
    "stage" "InvoiceStage" NOT NULL DEFAULT 'REVIEW',
    "invoiceNumber" TEXT,
    "invoiceNumberNormalized" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2),
    "note" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "paidOn" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payMethod" "InvoicePayMethod",
    "paidNote" TEXT,
    "paidByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdByContactId" TEXT,
    "inboundEmailId" TEXT,
    "duplicateOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTask" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceFile" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT,
    "sha256" TEXT NOT NULL,
    "thumbPathname" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceEventKind" NOT NULL,
    "actorUserId" TEXT,
    "actorContactId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "resendId" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromLine" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT,
    "dmarc" TEXT,
    "status" "InboundEmailStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_inboundEmailId_key" ON "Invoice"("inboundEmailId");

-- CreateIndex
CREATE INDEX "Invoice_stage_invoiceDate_idx" ON "Invoice"("stage", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_stage_paidOn_idx" ON "Invoice"("stage", "paidOn");

-- CreateIndex
CREATE INDEX "Invoice_contactId_invoiceNumberNormalized_idx" ON "Invoice"("contactId", "invoiceNumberNormalized");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX "Invoice_duplicateOfId_idx" ON "Invoice"("duplicateOfId");

-- CreateIndex
CREATE INDEX "InvoiceTask_taskId_idx" ON "InvoiceTask"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTask_invoiceId_taskId_key" ON "InvoiceTask"("invoiceId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceFile_pathname_key" ON "InvoiceFile"("pathname");

-- CreateIndex
CREATE INDEX "InvoiceFile_invoiceId_idx" ON "InvoiceFile"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceFile_sha256_idx" ON "InvoiceFile"("sha256");

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_resendId_key" ON "InboundEmail"("resendId");

-- CreateIndex
CREATE INDEX "InboundEmail_localPart_receivedAt_idx" ON "InboundEmail"("localPart", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundEmail_from_receivedAt_idx" ON "InboundEmail"("from", "receivedAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_invoiceId_idx" ON "NotificationOutbox"("invoiceId");

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByContactId_fkey" FOREIGN KEY ("createdByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTask" ADD CONSTRAINT "InvoiceTask_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTask" ADD CONSTRAINT "InvoiceTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceFile" ADD CONSTRAINT "InvoiceFile_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actorContactId_fkey" FOREIGN KEY ("actorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rules Prisma can't express.
-- At most one maker, and at most one actor on a history line.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_one_creator"
  CHECK (NOT ("createdByUserId" IS NOT NULL AND "createdByContactId" IS NOT NULL));
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_one_actor"
  CHECK (NOT ("actorUserId" IS NOT NULL AND "actorContactId" IS NOT NULL));
-- A total is always above zero once typed.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_total_positive"
  CHECK ("total" IS NULL OR "total" > 0);
-- Not an invoice is the soft delete: "deletedAt" is set exactly while the stage says so.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deleted_when_not_invoice"
  CHECK (("stage" = 'NOT_INVOICE') = ("deletedAt" IS NOT NULL));
-- The paid fields are set exactly while Paid: Undo paid clears them all.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paid_fields"
  CHECK (CASE WHEN "stage" = 'PAID'
    THEN "paidOn" IS NOT NULL AND "paidAt" IS NOT NULL AND "payMethod" IS NOT NULL
    ELSE "paidOn" IS NULL AND "paidAt" IS NULL AND "payMethod" IS NULL AND "paidNote" IS NULL AND "paidByUserId" IS NULL
  END);
-- To pay and Paid were approved; To review wasn't (Back to review clears it). Not an invoice keeps what it had, so
-- its Undo puts a To pay invoice back as it was.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_approved_fields"
  CHECK (CASE "stage"
    WHEN 'REVIEW' THEN "approvedAt" IS NULL AND "approvedByUserId" IS NULL
    WHEN 'TO_PAY' THEN "approvedAt" IS NOT NULL
    WHEN 'PAID' THEN "approvedAt" IS NOT NULL
    ELSE TRUE
  END);
-- An invoice never duplicates itself.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_duplicate_not_self"
  CHECK ("duplicateOfId" IS NULL OR "duplicateOfId" <> "id");
-- A file's hash is SHA-256 in lowercase hex.
ALTER TABLE "InvoiceFile" ADD CONSTRAINT "InvoiceFile_sha256_hex"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- Row level security
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboundEmail" ENABLE ROW LEVEL SECURITY;
