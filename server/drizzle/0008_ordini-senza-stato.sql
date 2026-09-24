-- Un ordine senza stato adesso lo dice l'agente, con `order` sulla capacità,
-- e non più un elenco di nomi tenuto nel sito e nel server. Le capacità già
-- salvate lo ricevono qui, anche quelle dei dispositivi spariti che non si
-- ripresenteranno: sono gli stessi nomi dell'elenco che c'era, con o senza
-- l'entità davanti (`luce#press`).
UPDATE "devices"
SET "capabilities" = (
  SELECT jsonb_agg(
    CASE
      WHEN c->>'kind' = 'enum'
        AND regexp_replace(c->>'code', '^.*#', '') IN ('move', 'volume_step', 'playback', 'press', 'activate', 'vacuum', 'mower')
      THEN c || '{"order": true}'::jsonb
      ELSE c
    END
    ORDER BY i
  )
  FROM jsonb_array_elements("capabilities") WITH ORDINALITY AS t(c, i)
)
WHERE jsonb_typeof("capabilities") = 'array' AND jsonb_array_length("capabilities") > 0;
