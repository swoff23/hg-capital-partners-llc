-- Contractor trades as one list (docs/specs/contractor-trades.md, approved by
-- Connor on Nov 14).
--
-- Two tables: Trade (each trade once; "key" is the name lowercased, single
-- spaces, no commas, so "plumbing" can't sit beside "Plumbing") and
-- ContactTrade (who does what). Both get RLS, as every table does.
--
-- Then every contractor's old free text ("Plumber/minor HVAC / Plumbing") is
-- split on "/" and each piece mapped to a trade by the table below, which is
-- src/lib/contractors/trade-map.ts (trade-map.test.ts holds the two equal).
-- A piece the table doesn't cover becomes its own trade, first letter
-- capitalized, so nothing is lost. The prod dry run (npm run trades:dry-run)
-- lists every such piece before this ships.
--
-- Additive: Contact.trades is left as it was, a backup nothing writes any
-- more, and a later release drops it. The code that reads the links ships in
-- the same push; the production build's prebuild applies this first
-- (scripts/prebuild.mjs).

CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Trade_key_key" ON "Trade"("key");

CREATE TABLE "ContactTrade" (
    "contactId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    CONSTRAINT "ContactTrade_pkey" PRIMARY KEY ("contactId","tradeId")
);
CREATE INDEX "ContactTrade_tradeId_idx" ON "ContactTrade"("tradeId");
ALTER TABLE "ContactTrade" ADD CONSTRAINT "ContactTrade_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTrade" ADD CONSTRAINT "ContactTrade_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactTrade" ENABLE ROW LEVEL SECURITY;

-- The map: an old spelling's key, and the trade it becomes.
CREATE TEMP TABLE "_trade_map" ("spelling" TEXT PRIMARY KEY, "trade" TEXT NOT NULL);
INSERT INTO "_trade_map" ("spelling", "trade") VALUES
    ('cleaning', 'Cleaning'),
    ('property cleaning', 'Cleaning'),
    ('house cleaner', 'Cleaning'),
    ('cleanouts', 'Cleanouts'),
    ('bulk cleaning', 'Cleanouts'),
    ('trash clean up', 'Cleanouts'),
    ('demo', 'Demo'),
    ('drywall', 'Drywall'),
    ('electric', 'Electric'),
    ('flooring', 'Flooring'),
    ('floor install', 'Flooring'),
    ('floor install only', 'Flooring'),
    ('framing', 'Framing'),
    ('handyman', 'Handyman'),
    ('general', 'Handyman'),
    ('everything', 'Handyman'),
    ('misc.', 'Handyman'),
    ('hvac', 'HVAC'),
    ('minor hvac', 'HVAC'),
    ('landscaping', 'Landscaping'),
    ('notary', 'Notary'),
    ('painting', 'Painting'),
    ('paint', 'Painting'),
    ('pest control', 'Pest control'),
    ('bees', 'Pest control'),
    ('rats', 'Pest control'),
    ('pests', 'Pest control'),
    ('plumbing', 'Plumbing'),
    ('plumber', 'Plumbing'),
    ('exterior plumbing', 'Plumbing'),
    ('snow removal', 'Snow removal'),
    ('plowing', 'Snow removal'),
    ('snow shoveling', 'Snow removal'),
    ('tile', 'Tile'),
    ('tile install', 'Tile'),
    ('trim', 'Trim');

-- Every piece of every contractor's text, tidied as tradeName() does: commas
-- out, spaces collapsed, trimmed, at most 40 characters.
CREATE TEMP TABLE "_trade_piece" AS
SELECT DISTINCT c."id" AS "contactId",
       btrim(left(btrim(regexp_replace(replace(p, ',', ' '), '\s+', ' ', 'g')), 40)) AS "piece"
FROM "Contact" c, unnest(string_to_array(c."trades", '/')) AS p
WHERE c."trades" IS NOT NULL;
DELETE FROM "_trade_piece" WHERE "piece" = '';

-- Each piece's trade: the map's, or the piece itself with its first letter capitalized.
ALTER TABLE "_trade_piece" ADD COLUMN "trade" TEXT;
UPDATE "_trade_piece" t SET "trade" = COALESCE(
    (SELECT m."trade" FROM "_trade_map" m WHERE m."spelling" = lower(t."piece")),
    upper(left(t."piece", 1)) || substr(t."piece", 2)
);

-- The 17 trades, whether or not anyone does them yet, then any trade only the text names.
INSERT INTO "Trade" ("id", "name", "key")
SELECT gen_random_uuid()::text, "trade", lower("trade") FROM (SELECT DISTINCT "trade" FROM "_trade_map") m
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "Trade" ("id", "name", "key")
SELECT gen_random_uuid()::text, min("trade"), lower("trade") FROM "_trade_piece" GROUP BY lower("trade")
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "ContactTrade" ("contactId", "tradeId")
SELECT DISTINCT p."contactId", t."id" FROM "_trade_piece" p JOIN "Trade" t ON t."key" = lower(p."trade")
ON CONFLICT DO NOTHING;

DROP TABLE "_trade_piece";
DROP TABLE "_trade_map";
