-- One-time data fixes from the UI/UX review (docs/uiux-review: PORTFOLIO-V01,
-- PORTFOLIO-001), decided by Connor on 2026-10-23. Every statement is guarded
-- on the imported values, so a row someone has corrected by hand is left alone
-- and re-running this changes nothing. scripts/migrate/01-properties.ts makes
-- the same split and keeps the same counts on a re-import.

-- 1. 765 and 767 Prospect were bought together. The SREO sheet has one combined
--    "765/767 Prospect" line and the import copied it onto both rows, so
--    Portfolio counted the purchase, value and loan twice. Split it evenly.
--    Exactly one 765 row and one 767 row must still hold the full combined
--    figures, or neither changes and the deploy log says why.
DO $$
DECLARE
  combined CONSTANT text := '"purchasePrice" = 240000 AND "value" = 550000 AND "currentLoan" = 292890 AND "replacementCost" = 800000 AND "sqft" = 4593';
  n765 int;
  n767 int;
  split int;
BEGIN
  EXECUTE format('SELECT count(*) FROM "Property" WHERE "address" ILIKE %L AND %s', '765 Prospect%', combined) INTO n765;
  EXECUTE format('SELECT count(*) FROM "Property" WHERE "address" ILIKE %L AND %s', '767 Prospect%', combined) INTO n767;
  SELECT count(*) INTO split FROM "Property"
  WHERE ("address" ILIKE '765 Prospect%' OR "address" ILIKE '767 Prospect%')
    AND "purchasePrice" = 120000 AND "value" = 275000 AND "currentLoan" = 146445 AND "replacementCost" = 400000;

  IF n765 = 1 AND n767 = 1 THEN
    UPDATE "Property"
    SET "purchasePrice" = 120000.00,
        "value" = 275000.00,
        "currentLoan" = 146445.00,
        "replacementCost" = 400000.00,
        "sqft" = CASE WHEN "address" ILIKE '765 Prospect%' THEN 2297 ELSE 2296 END
    WHERE ("address" ILIKE '765 Prospect%' OR "address" ILIKE '767 Prospect%')
      AND "purchasePrice" = 240000 AND "value" = 550000 AND "currentLoan" = 292890
      AND "replacementCost" = 800000 AND "sqft" = 4593;
  ELSIF split < 2 AND (n765 + n767) > 0 THEN
    RAISE WARNING '765/767 Prospect not split: % row(s) for 765 and % for 767 still hold the combined figures. Split them by hand.', n765, n767;
  END IF;
END $$;

-- 2. Unit counts Connor confirmed: 23 Sherwood has 2 units, and 765 and 767
--    Prospect have 2 each. The import had 1, and 4 on both from the combined line.
UPDATE "Property" SET "unitCount" = 2
WHERE "address" ILIKE '23 Sherwood%' AND "unitCount" = 1;

UPDATE "Property" SET "unitCount" = 2
WHERE ("address" ILIKE '765 Prospect%' OR "address" ILIKE '767 Prospect%') AND "unitCount" = 4;
