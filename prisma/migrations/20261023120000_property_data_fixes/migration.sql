-- One-time data fixes from the UI/UX review (docs/uiux-review: PORTFOLIO-V01,
-- PORTFOLIO-001), decided by Connor on 2026-10-23. Every statement is guarded
-- on the imported values, so a row someone has corrected by hand is left alone
-- and re-running this changes nothing.

-- 1. 765 and 767 Prospect were bought together. The SREO sheet has one combined
--    "765/767 Prospect" line and the import copied it onto both rows, so
--    Portfolio counted the purchase, value and loan twice. Split it evenly
--    (scripts/migrate/01-properties.ts now does the same on a re-import).
--    Both rows must still hold the full combined figures, or neither changes.
WITH pair AS (
  SELECT "id" FROM "Property"
  WHERE ("address" ILIKE '765 Prospect%' OR "address" ILIKE '767 Prospect%')
    AND "purchasePrice" = 240000 AND "value" = 550000 AND "currentLoan" = 292890
    AND "replacementCost" = 800000 AND "sqft" = 4593
)
UPDATE "Property" p
SET "purchasePrice" = 120000.00,
    "value" = 275000.00,
    "currentLoan" = 146445.00,
    "replacementCost" = 400000.00,
    "sqft" = CASE WHEN p."address" ILIKE '765 Prospect%' THEN 2297 ELSE 2296 END
WHERE p."id" IN (SELECT "id" FROM pair)
  AND (SELECT count(*) FROM pair) = 2;

-- 2. Unit counts Connor confirmed: 23 Sherwood has 2 units, and 765 and 767
--    Prospect have 2 each. The import had 1, and 4 on both from the combined line.
UPDATE "Property" SET "unitCount" = 2
WHERE "address" ILIKE '23 Sherwood%' AND "unitCount" = 1;

UPDATE "Property" SET "unitCount" = 2
WHERE ("address" ILIKE '765 Prospect%' OR "address" ILIKE '767 Prospect%') AND "unitCount" = 4;
