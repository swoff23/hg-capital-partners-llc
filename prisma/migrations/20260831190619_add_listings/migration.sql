-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('AVAILABLE', 'LEASED', 'HIDDEN');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "zillowUrl" TEXT,
    "rent" DECIMAL(10,2),
    "beds" TEXT,
    "baths" TEXT,
    "sqft" INTEGER,
    "availableDate" TIMESTAMP(3),
    "status" "ListingStatus" NOT NULL DEFAULT 'HIDDEN',
    "photoUrl" TEXT,
    "photoPathname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_propertyId_idx" ON "Listing"("propertyId");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
