-- AlterTable
ALTER TABLE "Property" DROP COLUMN "links";

-- CreateTable
CREATE TABLE "PropertyAttachment" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyAttachment_propertyId_idx" ON "PropertyAttachment"("propertyId");

-- AddForeignKey
ALTER TABLE "PropertyAttachment" ADD CONSTRAINT "PropertyAttachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

