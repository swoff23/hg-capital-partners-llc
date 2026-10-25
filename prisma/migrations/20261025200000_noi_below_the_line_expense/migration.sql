-- Depreciation, Miscellaneous and Penalties & Settlements were counted inside
-- NOI. QuickBooks reports them under Other Expense, below its own Net Operating
-- Income, and the seed put them in OTHER_OPEX / OPERATING_EXPENSE. The seed now
-- puts them (and amortization) below NOI as OTHER / NON_OPERATING
-- (src/lib/quickbooks/categorize.ts), where computeNoi counts them against net
-- income only. A seed change reaches an unlocked account on its next sync, but
-- the ledger lines already stored keep the treatment they were written with,
-- so this moves both now.
--
-- Guarded and idempotent, like the property data fixes: only an account still
-- on the seeded default changes (categoryLocked false, OTHER_OPEX,
-- OPERATING_EXPENSE). An account a partner set by hand is locked
-- (setAccountCategory), so it's left alone and the deploy log says so. Its
-- lines move only while they still carry the old default too. Re-running it
-- changes nothing.
DO $$
DECLARE
  below_noi CONSTANT text := $re$\mdepreciat|\mamortiz$re$;
  moved_accounts int;
  moved_lines int;
  skipped text;
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
      AND a."category" = 'OTHER_OPEX'
      AND a."treatment" = 'OPERATING_EXPENSE'
  )
  UPDATE "QboAccount" a
  SET "category" = 'OTHER', "treatment" = 'NON_OPERATING', "updatedAt" = now()
  FROM target t
  WHERE a."id" = t."id";
  GET DIAGNOSTICS moved_accounts = ROW_COUNT;

  -- Lines of every account now seeded below NOI, matched by account id (or by
  -- name where the report gave no id, as the sync's lookup does), still on the
  -- old default.
  UPDATE "LedgerLine" l
  SET "category" = 'OTHER', "treatment" = 'NON_OPERATING'
  FROM "QboAccount" a
  WHERE l."realmId" = a."realmId"
    AND (l."accountQboId" = a."qboId" OR (l."accountQboId" = '' AND l."accountName" = a."name"))
    AND a."categoryLocked" = false
    AND a."category" = 'OTHER'
    AND a."treatment" = 'NON_OPERATING'
    AND l."category" = 'OTHER_OPEX'
    AND l."treatment" = 'OPERATING_EXPENSE';
  GET DIAGNOSTICS moved_lines = ROW_COUNT;

  RAISE NOTICE 'Moved % QuickBooks account(s) and % ledger line(s) below NOI.', moved_accounts, moved_lines;

  -- The same accounts, left where someone put them (or on a default this didn't expect).
  SELECT string_agg(format('%s (%s, %s%s)', a."fullyQualifiedName", a."category", a."treatment",
                           CASE WHEN a."categoryLocked" THEN ', set by hand' ELSE '' END), '; ')
  INTO skipped
  FROM "QboAccount" a
  WHERE a."classification" = 'Expense'
    AND (
      a."acctSubType" IN ('Depreciation', 'Amortization', 'PenaltiesSettlements', 'OtherMiscellaneousExpense')
      OR a."name" ~* below_noi
      OR a."fullyQualifiedName" ~* below_noi
    )
    AND a."treatment" <> 'NON_OPERATING';
  IF skipped IS NOT NULL THEN
    RAISE WARNING 'Left in NOI, not on the seeded default: %. Check them in Financials, Settings, Account categories.', skipped;
  END IF;
END $$;
