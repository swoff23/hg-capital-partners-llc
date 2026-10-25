-- Follows 20261025200000_noi_below_the_line_expense, which moved below NOI
-- only the accounts still on the old seed (OTHER_OPEX / OPERATING_EXPENSE).
-- The sync re-seeds every unlocked account on each run, so "unlocked" is the
-- seeded-default test: an unlocked depreciation, amortization, penalties or
-- miscellaneous expense account goes below NOI whatever an older seed gave it
-- (a name rule could have put "Tax penalties" in TAXES), and so do its stored
-- lines, which an incremental sync doesn't rewrite for older months. An
-- account a partner set by hand is locked (setAccountCategory) and stays as
-- set; the deploy log names each one and what it was set to.
--
-- "Other" picked in Settings now puts an expense account below NOI
-- (treatmentForCategory). An expense account set to Other by hand before that
-- still counts inside NOI; the log names those too, so a partner can pick
-- Other again (below NOI) or Other operating (inside it).
--
-- Idempotent: a re-run finds nothing left to move.
DO $$
DECLARE
  below_noi CONSTANT text := $re$\mdepreciat|\mamortiz$re$;
  moved_accounts int;
  moved_lines int;
  hand_set text;
  old_other text;
BEGIN
  WITH target AS (
    SELECT a."id"
    FROM "QboAccount" a
    WHERE a."classification" = 'Expense'
      AND (
        a."acctSubType" IN ('Depreciation', 'Amortization', 'PenaltiesSettlements', 'OtherMiscellaneousExpense')
        OR a."name" ~* below_noi
        OR a."fullyQualifiedName" ~* below_noi
      )
      AND a."categoryLocked" = false
      AND (a."category" <> 'OTHER' OR a."treatment" <> 'NON_OPERATING')
  )
  UPDATE "QboAccount" a
  SET "category" = 'OTHER', "treatment" = 'NON_OPERATING', "updatedAt" = now()
  FROM target t
  WHERE a."id" = t."id";
  GET DIAGNOSTICS moved_accounts = ROW_COUNT;

  -- Every stored line of those accounts, matched by account id (or by name
  -- where the report gave no id, as the sync's lookup does).
  UPDATE "LedgerLine" l
  SET "category" = 'OTHER', "treatment" = 'NON_OPERATING'
  FROM "QboAccount" a
  WHERE l."realmId" = a."realmId"
    AND (l."accountQboId" = a."qboId" OR (l."accountQboId" = '' AND l."accountName" = a."name"))
    AND a."classification" = 'Expense'
    AND (
      a."acctSubType" IN ('Depreciation', 'Amortization', 'PenaltiesSettlements', 'OtherMiscellaneousExpense')
      OR a."name" ~* below_noi
      OR a."fullyQualifiedName" ~* below_noi
    )
    AND a."categoryLocked" = false
    AND (l."category" <> 'OTHER' OR l."treatment" <> 'NON_OPERATING');
  GET DIAGNOSTICS moved_lines = ROW_COUNT;

  RAISE NOTICE 'Moved % more QuickBooks account(s) and % more ledger line(s) below NOI.', moved_accounts, moved_lines;

  SELECT string_agg(format('%s (%s, %s)', a."fullyQualifiedName", a."category", a."treatment"), '; ' ORDER BY a."fullyQualifiedName")
  INTO hand_set
  FROM "QboAccount" a
  WHERE a."classification" = 'Expense'
    AND (
      a."acctSubType" IN ('Depreciation', 'Amortization', 'PenaltiesSettlements', 'OtherMiscellaneousExpense')
      OR a."name" ~* below_noi
      OR a."fullyQualifiedName" ~* below_noi
    )
    AND a."categoryLocked" = true
    AND a."treatment" <> 'NON_OPERATING';
  IF hand_set IS NOT NULL THEN
    RAISE WARNING 'Set by hand, so left as set: %. Depreciation, penalties and miscellaneous expense usually sit below NOI; check them in Financials, Settings, Account categories.', hand_set;
  END IF;

  SELECT string_agg(a."fullyQualifiedName", '; ' ORDER BY a."fullyQualifiedName")
  INTO old_other
  FROM "QboAccount" a
  WHERE a."classification" = 'Expense'
    AND a."categoryLocked" = true
    AND a."category" = 'OTHER'
    AND a."treatment" <> 'NON_OPERATING';
  IF old_other IS NOT NULL THEN
    RAISE WARNING 'Set to Other by hand when Other counted inside NOI, so still inside it: %. Pick Other again to move one below NOI, or Other operating to keep it in.', old_other;
  END IF;
END $$;
