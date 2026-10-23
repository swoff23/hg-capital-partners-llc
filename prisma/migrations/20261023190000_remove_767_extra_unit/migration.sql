-- Connor, 2026-10-23: 767 Prospect has two units, not three. Its records were
-- "Upper / Upper Front", "1st Front / Lower Front" and "1st Rear / Apt #3". The
-- 1st Front record had the least on it (two appliances to the others' four), so
-- it goes, and the unit count, which now follows the unit records, reads 2.
-- Its own gas and electric account numbers and its appliances are copied into
-- the property's notes first, so nothing is lost.
--
-- Guarded: only a 767 row that still has exactly those three records changes,
-- and only when no task or listing names the unit (trimmed, case-insensitive,
-- the way the lockbox lookup matches). Re-running it changes nothing.
WITH target AS (
  SELECT p."id", p."units"
  FROM "Property" p
  WHERE p."address" ILIKE '767 Prospect%'
    AND jsonb_array_length(p."units") = 3
    AND p."units" @> '[{"label": "Upper / Upper Front"}]'
    AND p."units" @> '[{"label": "1st Front / Lower Front"}]'
    AND p."units" @> '[{"label": "1st Rear / Apt #3"}]'
    AND NOT EXISTS (
      SELECT 1 FROM "Task" t
      WHERE t."propertyId" = p."id" AND lower(trim(t."unitLabel")) = '1st front / lower front'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l."propertyId" = p."id" AND lower(trim(l."unitLabel")) = '1st front / lower front'
    )
),
removed AS (
  SELECT t."id", u
  FROM target t, jsonb_array_elements(t."units") AS u
  WHERE u->>'label' = '1st Front / Lower Front'
),
note AS (
  SELECT r."id",
    'Removed the unit record "1st Front / Lower Front" on Oct 23, 2026 (767 has two units). Its details: '
    || concat_ws('; ',
         'National Grid acct ' || nullif(r.u->'utilities'->>'nationalGridAcct', ''),
         'National Grid autopay ' || nullif(r.u->'utilities'->>'nationalGridAutopay', ''),
         'National Grid LOFL ' || nullif(r.u->'utilities'->>'nationalGridLofl', ''),
         'National Fuel acct ' || nullif(r.u->'utilities'->>'nationalFuelAcct', ''),
         'National Fuel autopay ' || nullif(r.u->'utilities'->>'nationalFuelAutopay', ''),
         'National Fuel LOFL ' || nullif(r.u->'utilities'->>'nationalFuelLofl', ''),
         'Water acct ' || nullif(r.u->'utilities'->>'waterAcct', ''),
         'Water autopay ' || nullif(r.u->'utilities'->>'waterAutopay', ''),
         (SELECT string_agg(
                   (e->>'type')
                   || coalesce(' ' || nullif(e->>'model', ''), '')
                   || coalesce(' (' || nullif(e->>'installYear', '') || ')', ''),
                   ', ')
            FROM jsonb_array_elements(coalesce(r.u->'equipment', '[]'::jsonb)) AS e)
       ) || '.' AS text
  FROM removed r
)
UPDATE "Property" p
SET "units" = (
      SELECT jsonb_agg(u ORDER BY ord)
      FROM jsonb_array_elements(p."units") WITH ORDINALITY AS x(u, ord)
      WHERE u->>'label' IS DISTINCT FROM '1st Front / Lower Front'
    ),
    "notes" = concat_ws(E'\n\n', nullif(p."notes", ''), n."text"),
    "unitCount" = 2
FROM note n
WHERE p."id" = n."id";
