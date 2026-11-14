-- The building's bedrooms and bathrooms, all units together, shown in Details and under the address.
-- Nullable and empty until someone fills them in.
ALTER TABLE "Property" ADD COLUMN "beds" INTEGER,
ADD COLUMN "baths" DECIMAL(6,2);
