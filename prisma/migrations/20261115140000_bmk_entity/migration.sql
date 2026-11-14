-- Entity is a list of the five QuickBooks companies (docs/specs/property-page.md, decision 4).
-- 58 Mariner Street's entity was typed as "1) 50% BK \n2) 50% HG Buffalo Holding 1 LLC";
-- QuickBooks already files it under BMK Property Group LLC, the 50/50 company with BK.
UPDATE "Property"
SET "llcOwner" = 'BMK Property Group LLC'
WHERE "llcOwner" LIKE '%50% BK%';
