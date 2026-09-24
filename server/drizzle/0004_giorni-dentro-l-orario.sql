-- Giorni e ore del «solo se» non valgono più per l'orario, che ha i suoi.
-- Le scene scritte prima devono continuare a partire negli stessi momenti,
-- quindi quello che dicevano lì passa dentro all'orario.

-- I giorni della condizione restringono quelli dell'orario. Un orario senza
-- giorni vuol dire tutti.
UPDATE "scenes" s
SET "timing" = jsonb_set(s."timing", '{days}', (
  SELECT coalesce(jsonb_agg(d ORDER BY d), '[]'::jsonb)
  FROM jsonb_array_elements(s."conditions") AS c, jsonb_array_elements(c->'days') AS d
  WHERE c->>'kind' = 'days'
    AND (jsonb_array_length(s."timing"->'days') = 0 OR s."timing"->'days' @> jsonb_build_array(d))
))
WHERE s."timing" IS NOT NULL
  AND s."conditions" @> '[{"kind": "days"}]';
--> statement-breakpoint

-- Un orario che non capitava mai nei giorni o nella fascia chiesti non
-- partiva mai, e resta così, cioè spento.
UPDATE "scenes" s
SET "timing" = s."timing" || '{"off": true}'::jsonb
WHERE s."timing" IS NOT NULL
  AND (
    jsonb_array_length(s."timing"->'days') = 0 AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(s."conditions") AS c
      WHERE c->>'kind' = 'days' AND jsonb_array_length(c->'days') > 0
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(s."conditions") AS c
      WHERE c->>'kind' = 'hours'
        AND NOT CASE
          WHEN c->>'from' <= c->>'to'
            THEN c->>'from' <= s."timing"->>'at' AND s."timing"->>'at' < c->>'to'
          ELSE s."timing"->>'at' >= c->>'from' OR s."timing"->>'at' < c->>'to'
        END
    )
  );
--> statement-breakpoint

-- Senza un dispositivo che la fa partire, giorni e ore non servono più a niente.
UPDATE "scenes"
SET "conditions" = (
  SELECT coalesce(jsonb_agg(c), '[]'::jsonb)
  FROM jsonb_array_elements("conditions") AS c
  WHERE c->>'kind' NOT IN ('days', 'hours')
)
WHERE jsonb_array_length("triggers") = 0
  AND ("conditions" @> '[{"kind": "days"}]' OR "conditions" @> '[{"kind": "hours"}]');
