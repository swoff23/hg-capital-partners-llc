-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "closingCosts" DECIMAL(12,2),
ADD COLUMN     "insuranceCarrier" TEXT,
ADD COLUMN     "insuranceCoverage" DECIMAL(12,2),
ADD COLUMN     "insuranceDeductible" DECIMAL(12,2),
ADD COLUMN     "insuranceLiability" TEXT,
ADD COLUMN     "insurancePolicyNo" TEXT,
ADD COLUMN     "insurancePremium" DECIMAL(12,2),
ADD COLUMN     "insuranceRenewalDate" TIMESTAMP(3),
ADD COLUMN     "loanEscrow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loanMaturityDate" TIMESTAMP(3),
ADD COLUMN     "loanNumber" TEXT,
ADD COLUMN     "loanOriginalAmount" DECIMAL(12,2),
ADD COLUMN     "loanOriginationDate" TIMESTAMP(3),
ADD COLUMN     "loanPaymentMonthly" DECIMAL(12,2),
ADD COLUMN     "loanRate" DECIMAL(6,3),
ADD COLUMN     "loanType" TEXT,
ADD COLUMN     "propertyTaxDueDate" TIMESTAMP(3),
ADD COLUMN     "rentalRegistrationExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "autoKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_autoKey_key" ON "Task"("autoKey");

