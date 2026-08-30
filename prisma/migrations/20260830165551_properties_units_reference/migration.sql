/*
  Warnings:

  - You are about to drop the column `equipment` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedValue` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `lockboxCode` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `unitLabel` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `utilities` on the `Property` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Property" DROP COLUMN "equipment",
DROP COLUMN "estimatedValue",
DROP COLUMN "lockboxCode",
DROP COLUMN "unitLabel",
DROP COLUMN "utilities",
ADD COLUMN     "refiTarget" TEXT,
ADD COLUMN     "rehabAmount" DECIMAL(12,2),
ADD COLUMN     "rehabMonths" DECIMAL(8,2),
ADD COLUMN     "replacementCost" DECIMAL(12,2),
ADD COLUMN     "units" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "value" DECIMAL(12,2);
