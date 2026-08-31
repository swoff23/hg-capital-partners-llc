-- CreateEnum
CREATE TYPE "QboConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "QboBasis" AS ENUM ('CASH', 'ACCRUAL');

-- CreateEnum
CREATE TYPE "QboClassRole" AS ENUM ('UNMAPPED', 'PROPERTY', 'ENTITY', 'OVERHEAD', 'IGNORE');

-- CreateEnum
CREATE TYPE "QboCategory" AS ENUM ('RENT', 'OTHER_INCOME', 'TAXES', 'INSURANCE', 'REPAIRS', 'UTILITIES', 'MANAGEMENT', 'LEGAL_PROFESSIONAL', 'LEASING_COMMISSION', 'BANK_FEES', 'SOFTWARE', 'TRAVEL', 'OTHER_OPEX', 'DEBT_INTEREST', 'UNCATEGORIZED', 'CAPEX', 'INTERCOMPANY', 'OWNER_EQUITY', 'SUSPENSE', 'EXCLUDED', 'OTHER');

-- CreateEnum
CREATE TYPE "QboTreatment" AS ENUM ('OPERATING_INCOME', 'OPERATING_EXPENSE', 'NON_OPERATING', 'DEBT_INTEREST', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "QboLineTag" AS ENUM ('OWNER_FUNDED', 'SUBSIDY', 'INTERNAL_TRANSFER', 'NEGATIVE_RECLASS', 'CAPEX_FLAG');

-- CreateEnum
CREATE TYPE "QboSyncTrigger" AS ENUM ('INITIAL', 'CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "QboSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "QuickbooksConnection" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "status" "QboConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "companyName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "prevRefreshTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenRefreshedAt" TIMESTAMP(3),
    "accountingMethod" "QboBasis" NOT NULL DEFAULT 'CASH',
    "historyStart" VARCHAR(7) NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickbooksConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboEntity" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "llcOwnerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isJointVenture" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboClass" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullyQualifiedName" TEXT NOT NULL,
    "parentQboId" TEXT,
    "isSubClass" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "role" "QboClassRole" NOT NULL DEFAULT 'UNMAPPED',
    "propertyId" TEXT,
    "entityId" TEXT,
    "autoMatched" BOOLEAN NOT NULL DEFAULT false,
    "autoMatchNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboAccount" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullyQualifiedName" TEXT NOT NULL,
    "acctType" TEXT NOT NULL,
    "acctSubType" TEXT,
    "classification" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentQboId" TEXT,
    "category" "QboCategory" NOT NULL DEFAULT 'OTHER',
    "categoryLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboVendor" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerLine" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "basis" "QboBasis" NOT NULL,
    "periodMonth" VARCHAR(7) NOT NULL,
    "txnDate" DATE NOT NULL,
    "qboTxnId" TEXT NOT NULL,
    "txnType" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "docNumber" TEXT,
    "name" TEXT,
    "memo" TEXT,
    "businessName" TEXT,
    "accountQboId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "splitAccount" TEXT,
    "classification" TEXT NOT NULL,
    "category" "QboCategory" NOT NULL,
    "treatment" "QboTreatment" NOT NULL,
    "classKey" TEXT NOT NULL,
    "className" TEXT,
    "propertyId" TEXT,
    "entityId" TEXT,
    "classRole" "QboClassRole" NOT NULL DEFAULT 'UNMAPPED',
    "lineTags" "QboLineTag"[],
    "vendorQboId" TEXT,
    "customerName" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "raw" JSONB NOT NULL,
    "syncRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboSyncRun" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "trigger" "QboSyncTrigger" NOT NULL,
    "status" "QboSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "monthsProcessed" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "QboSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickbooksConnection_realmId_key" ON "QuickbooksConnection"("realmId");

-- CreateIndex
CREATE INDEX "QboEntity_realmId_idx" ON "QboEntity"("realmId");

-- CreateIndex
CREATE UNIQUE INDEX "QboEntity_realmId_code_key" ON "QboEntity"("realmId", "code");

-- CreateIndex
CREATE INDEX "QboClass_realmId_role_idx" ON "QboClass"("realmId", "role");

-- CreateIndex
CREATE INDEX "QboClass_propertyId_idx" ON "QboClass"("propertyId");

-- CreateIndex
CREATE INDEX "QboClass_entityId_idx" ON "QboClass"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "QboClass_realmId_qboId_key" ON "QboClass"("realmId", "qboId");

-- CreateIndex
CREATE INDEX "QboAccount_realmId_category_idx" ON "QboAccount"("realmId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "QboAccount_realmId_qboId_key" ON "QboAccount"("realmId", "qboId");

-- CreateIndex
CREATE INDEX "QboVendor_contactId_idx" ON "QboVendor"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "QboVendor_realmId_qboId_key" ON "QboVendor"("realmId", "qboId");

-- CreateIndex
CREATE INDEX "LedgerLine_realmId_basis_periodMonth_idx" ON "LedgerLine"("realmId", "basis", "periodMonth");

-- CreateIndex
CREATE INDEX "LedgerLine_propertyId_basis_periodMonth_idx" ON "LedgerLine"("propertyId", "basis", "periodMonth");

-- CreateIndex
CREATE INDEX "LedgerLine_entityId_basis_periodMonth_idx" ON "LedgerLine"("entityId", "basis", "periodMonth");

-- CreateIndex
CREATE INDEX "LedgerLine_realmId_basis_treatment_periodMonth_idx" ON "LedgerLine"("realmId", "basis", "treatment", "periodMonth");

-- CreateIndex
CREATE INDEX "LedgerLine_realmId_basis_category_periodMonth_idx" ON "LedgerLine"("realmId", "basis", "category", "periodMonth");

-- CreateIndex
CREATE INDEX "LedgerLine_qboTxnId_idx" ON "LedgerLine"("qboTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerLine_realmId_basis_lineKey_key" ON "LedgerLine"("realmId", "basis", "lineKey");

-- CreateIndex
CREATE INDEX "QboSyncRun_realmId_startedAt_idx" ON "QboSyncRun"("realmId", "startedAt");

-- CreateIndex
CREATE INDEX "QboSyncRun_status_heartbeatAt_idx" ON "QboSyncRun"("status", "heartbeatAt");

-- AddForeignKey
ALTER TABLE "QuickbooksConnection" ADD CONSTRAINT "QuickbooksConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboEntity" ADD CONSTRAINT "QboEntity_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "QuickbooksConnection"("realmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboClass" ADD CONSTRAINT "QboClass_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "QuickbooksConnection"("realmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboClass" ADD CONSTRAINT "QboClass_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboClass" ADD CONSTRAINT "QboClass_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "QboEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboAccount" ADD CONSTRAINT "QboAccount_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "QuickbooksConnection"("realmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboVendor" ADD CONSTRAINT "QboVendor_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "QuickbooksConnection"("realmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboVendor" ADD CONSTRAINT "QboVendor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "QuickbooksConnection"("realmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "QboEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboSyncRun" ADD CONSTRAINT "QboSyncRun_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "QuickbooksConnection"("realmId") ON DELETE CASCADE ON UPDATE CASCADE;
