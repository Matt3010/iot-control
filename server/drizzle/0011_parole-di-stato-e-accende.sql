-- Due cose che il sito e il server sapevano per nome, e che adesso dice
-- l'agente sulla capacità: come si legge in una prova la voce di una
-- serratura o di una valvola (`detti`), e quale interruttore accende una
-- luminosità, una velocità, un bianco o un colore (`accende`). Le capacità
-- già salvate le ricevono qui, con le stesse parole che c'erano; al prossimo
-- inventario le riscrive comunque l'agente.
UPDATE "devices" d
SET "capabilities" = (
  SELECT jsonb_agg(
    CASE
      -- le parole di stato, solo per le voci che la capacità ha
      WHEN c->>'kind' = 'enum' AND NOT c ? 'detti'
        AND regexp_replace(c->>'code', '^.*#', '') IN ('lock', 'valve')
      THEN c || jsonb_build_object('detti', (
        SELECT COALESCE(jsonb_object_agg(v, parole), '{}'::jsonb)
        FROM jsonb_array_elements_text(c->'values') AS v
        JOIN (VALUES
          ('lock', 'Apri', '{"se": "aperto", "quando": "si apre"}'::jsonb),
          ('lock', 'Chiudi a chiave', '{"se": "chiuso a chiave", "quando": "si chiude a chiave"}'::jsonb),
          ('valve', 'Apri', '{"se": "aperto", "quando": "si apre"}'::jsonb),
          ('valve', 'Chiudi', '{"se": "chiuso", "quando": "si chiude"}'::jsonb)
        ) AS t(codice, voce, parole)
          ON t.codice = regexp_replace(c->>'code', '^.*#', '') AND t.voce = v
      ))
      -- l'interruttore della stessa entità, se il dispositivo ce l'ha
      WHEN NOT c ? 'accende'
        AND ((c->>'kind' = 'range' AND regexp_replace(c->>'code', '^.*#', '') IN ('brightness', 'speed', 'color_temp'))
          OR c->>'kind' = 'color')
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(d."capabilities") AS o
          WHERE o->>'kind' = 'switch' AND o->>'code' = COALESCE(substring(c->>'code' FROM '^(.*#)'), '') || 'power'
        )
      THEN c || jsonb_build_object('accende', COALESCE(substring(c->>'code' FROM '^(.*#)'), '') || 'power')
      ELSE c
    END
    ORDER BY i
  )
  FROM jsonb_array_elements(d."capabilities") WITH ORDINALITY AS t(c, i)
)
WHERE jsonb_typeof(d."capabilities") = 'array' AND jsonb_array_length(d."capabilities") > 0;
