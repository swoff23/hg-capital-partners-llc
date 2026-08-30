-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "theirPrice" DECIMAL(12,2),
    "theirPriceRaw" TEXT,
    "ourPrice" DECIMAL(12,2),
    "ourPriceRaw" TEXT,
    "currentOffer" DECIMAL(12,2),
    "units" INTEGER,
    "beds" TEXT,
    "baths" TEXT,
    "sqft" INTEGER,
    "taxes" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'Active',
    "priority" TEXT,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "passReason" TEXT,
    "sourceUrl" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "nextAction" TEXT,
    "nextActionDue" TIMESTAMP(3),
    "rawLatestUpdates" TEXT,
    "convertedPropertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealNote" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3),
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "unitLabel" TEXT,
    "llcOwner" TEXT,
    "attorney" TEXT,
    "lender" TEXT,
    "loanServicer" TEXT,
    "lockboxCode" TEXT,
    "status" TEXT,
    "strategy" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DECIMAL(12,2),
    "refinanceDate" TIMESTAMP(3),
    "currentLoan" DECIMAL(12,2),
    "estimatedValue" DECIMAL(12,2),
    "sqft" INTEGER,
    "unitCount" INTEGER,
    "utilities" JSONB NOT NULL DEFAULT '{}',
    "equipment" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "trades" TEXT,
    "tenantFixes" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "email" TEXT,
    "mailingAddress" TEXT,
    "billingInfo" TEXT,
    "availability" TEXT,
    "w9Url" TEXT,
    "coiUrl" TEXT,
    "comments" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeUserId" TEXT,
    "assigneeName" TEXT,
    "assigneeEmail" TEXT,
    "dueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "priority" TEXT,
    "bucket" TEXT NOT NULL DEFAULT 'Unfiled',
    "sectionRaw" TEXT,
    "tags" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "asanaId" TEXT,
    "dealId" TEXT,
    "propertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_convertedPropertyId_key" ON "Deal"("convertedPropertyId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_address_idx" ON "Deal"("address");

-- CreateIndex
CREATE INDEX "DealNote_dealId_noteDate_idx" ON "DealNote"("dealId", "noteDate");

-- CreateIndex
CREATE INDEX "Property_address_idx" ON "Property"("address");

-- CreateIndex
CREATE INDEX "Contact_fullName_idx" ON "Contact"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Task_asanaId_key" ON "Task"("asanaId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_bucket_idx" ON "Task"("bucket");

-- CreateIndex
CREATE INDEX "Task_propertyId_idx" ON "Task"("propertyId");

-- CreateIndex
CREATE INDEX "Task_dealId_idx" ON "Task"("dealId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_convertedPropertyId_fkey" FOREIGN KEY ("convertedPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealNote" ADD CONSTRAINT "DealNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
