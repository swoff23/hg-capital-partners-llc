-- Tenants and leases (docs/specs/tenants.md). Additive: five new tables, one
-- enum, one nullable Task column and one SecurityEventKind value. Nothing is
-- backfilled; the import (scripts/migrate/04-tenants.ts) fills the tables, and a
-- null entryPermittedAt means Tenant only. No statement here may use
-- TENANT_VIEWED: Postgres can't use an enum value in the transaction that adds
-- it (55P04), as 20261023000000_task_status_values says. Roll forward only.

-- CreateEnum
CREATE TYPE "LeaseSource" AS ENUM ('APP', 'IMPORT', 'PLAYBOOK');

-- AlterEnum
ALTER TYPE "SecurityEventKind" ADD VALUE 'TENANT_VIEWED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "entryPermittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneE164" TEXT,
    "email" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "unitLabel" TEXT,
    "movesIn" TIMESTAMP(3),
    "movesOut" TIMESTAMP(3),
    "deposit" DECIMAL(12,2),
    "notes" TEXT,
    "source" "LeaseSource" NOT NULL DEFAULT 'APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseTenant" (
    "leaseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "LeaseTenant_pkey" PRIMARY KEY ("leaseId","tenantId")
);

-- CreateTable
CREATE TABLE "LeaseTerm" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "rent" DECIMAL(12,2) NOT NULL,
    "subsidy" DECIMAL(12,2),
    "subsidyFrom" TEXT,
    "fileId" TEXT,

    CONSTRAINT "LeaseTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseFile" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT,

    CONSTRAINT "LeaseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_fullName_idx" ON "Tenant"("fullName");

-- CreateIndex
CREATE INDEX "Lease_propertyId_unitId_idx" ON "Lease"("propertyId", "unitId");

-- CreateIndex
CREATE INDEX "LeaseTenant_tenantId_idx" ON "LeaseTenant"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseTerm_fileId_key" ON "LeaseTerm"("fileId");

-- CreateIndex
CREATE INDEX "LeaseTerm_leaseId_startsOn_idx" ON "LeaseTerm"("leaseId", "startsOn");

-- CreateIndex
CREATE INDEX "LeaseFile_leaseId_idx" ON "LeaseFile"("leaseId");

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTerm" ADD CONSTRAINT "LeaseTerm_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTerm" ADD CONSTRAINT "LeaseTerm_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "LeaseFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseFile" ADD CONSTRAINT "LeaseFile_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseFile" ADD CONSTRAINT "LeaseFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one primary per lease: the service keeps one, and this stops a second.
CREATE UNIQUE INDEX "LeaseTenant_one_primary" ON "LeaseTenant"("leaseId") WHERE "primary";

-- Every new table gets row-level security (README, Rules of the road). The app
-- reads it as the table owner, which RLS doesn't restrict; nothing else may.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaseTenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaseTerm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaseFile" ENABLE ROW LEVEL SECURITY;
