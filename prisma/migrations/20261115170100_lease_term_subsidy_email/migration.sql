-- Connor, Nov 14: a term with a housing authority share keeps that authority's
-- contact (the Section 8 caseworker), name and email, beside who pays.
-- Additive, nullable.
ALTER TABLE "LeaseTerm" ADD COLUMN "subsidyContact" TEXT;
ALTER TABLE "LeaseTerm" ADD COLUMN "subsidyEmail" TEXT;
