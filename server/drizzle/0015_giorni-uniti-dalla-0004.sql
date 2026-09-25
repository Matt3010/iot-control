-- La 0004 portava dentro all'orario i giorni delle condizioni, e quando le
-- condizioni sui giorni erano due le univa invece di intersecarle: «solo
-- lunedì e martedì» e «solo martedì e mercoledì» davano lunedì, martedì,
-- martedì e mercoledì, e la scena che partiva solo il martedì partiva tre
-- giorni. La 0004 è pubblicata e non si riscrive: qui si correggono le
-- scene in cui l'errore si riconosce ancora dai dati.

-- Un giorno ripetuto nell'orario lo scriveva solo quell'unione: il sito non
-- ne scrive mai due uguali. Il giorno che compare in tutte le condizioni è
-- quello ripetuto più volte, e restano solo quelli. Se le condizioni sui
-- giorni sono ancora scritte (le scene con una partenza da un dispositivo le
-- tenevano) e sono più delle volte che il giorno più ripetuto compare, allora
-- in nessun giorno valevano tutte insieme: la scena non partiva mai, e resta
-- così, cioè spenta.
WITH "conti" AS (
  SELECT s."id", d AS "giorno", count(*) AS "volte"
  FROM "scenes" s
  CROSS JOIN LATERAL jsonb_array_elements(s."timing"->'days') AS d
  WHERE s."timing" IS NOT NULL AND jsonb_typeof(s."timing"->'days') = 'array'
  GROUP BY s."id", d
),
"ripetuti" AS (
  SELECT "id", max("volte") AS "piu" FROM "conti" GROUP BY "id" HAVING max("volte") > 1
),
"condizioni" AS (
  SELECT s."id", count(*) AS "quante"
  FROM "scenes" s
  CROSS JOIN LATERAL jsonb_array_elements(s."conditions"->'items') AS c
  WHERE s."conditions"->>'match' = 'all' AND c->>'kind' = 'days' AND jsonb_array_length(c->'days') > 0
  GROUP BY s."id"
)
UPDATE "scenes" s
SET "timing" = jsonb_set(
    s."timing",
    '{days}',
    (SELECT jsonb_agg(c."giorno" ORDER BY c."giorno") FROM "conti" c WHERE c."id" = s."id" AND c."volte" = r."piu")
  ) || CASE WHEN coalesce(k."quante", 0) > r."piu" THEN '{"off": true}'::jsonb ELSE '{}'::jsonb END
FROM "ripetuti" r
LEFT JOIN "condizioni" k ON k."id" = r."id"
WHERE s."id" = r."id";--> statement-breakpoint

-- Due o più condizioni sui giorni che non hanno nessun giorno in comune, ancora
-- scritte, con l'orario che è esattamente la loro unione: prima della 0004
-- quella scena non partiva mai all'orario, e da allora partiva nei giorni di
-- tutte e due. Resta spenta, com'era.
UPDATE "scenes" s
SET "timing" = s."timing" || '{"off": true}'::jsonb
WHERE s."timing" IS NOT NULL
  AND coalesce((s."timing"->>'off')::boolean, false) = false
  AND s."conditions"->>'match' = 'all'
  AND (
    SELECT count(*) FROM jsonb_array_elements(s."conditions"->'items') AS c
    WHERE c->>'kind' = 'days' AND jsonb_array_length(c->'days') > 0
  ) >= 2
  AND s."timing"->'days' = (
    SELECT jsonb_agg(d ORDER BY d)
    FROM jsonb_array_elements(s."conditions"->'items') AS c
    CROSS JOIN LATERAL jsonb_array_elements(c->'days') AS d
    WHERE c->>'kind' = 'days'
  );
