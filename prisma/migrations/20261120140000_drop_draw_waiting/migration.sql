-- Rehab draws: Waiting on us is gone (Connor, Nov 20: "get rid of the whole waiting on us toggle/feature").
-- A draw that sits still shows on Home as stuck after 10 days. Drops the two columns 20261120130000_rehab_draws
-- added the same day; nothing else reads them. Roll forward only.

ALTER TABLE "Draw" DROP COLUMN "waitingOnUs",
DROP COLUMN "waitingNote";
