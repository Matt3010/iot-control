-- Quello che è rimasto scritto storto prima che il server lo impedisse.
-- Le funzioni qui sotto vivono solo dentro questa migrazione (pg_temp).

-- Le capacità dei dispositivi con la forma del protocollo. Un agente poteva
-- mandare capacità scritte come un oggetto invece che come un elenco, o
-- senza i campi che servono, e restavano salvate a rompere ogni inventario.
-- Quelle senza forma si tolgono, una capacità ripetuta vale una volta, e le
-- voci ripetute di un elenco si tengono una volta, nel loro ordine.
CREATE FUNCTION pg_temp.voci(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(x.voce ORDER BY x.primo), '[]'::jsonb)
  FROM (
    SELECT e.voce, min(e.n) AS primo
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v) = 'array' THEN v ELSE '[]'::jsonb END) WITH ORDINALITY AS e(voce, n)
    WHERE jsonb_typeof(e.voce) = 'string'
    GROUP BY e.voce
  ) x
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.ha_forma(c jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(c) = 'object'
    AND jsonb_typeof(c->'code') = 'string' AND c->>'code' <> ''
    AND jsonb_typeof(c->'label') = 'string'
    AND CASE c->>'kind'
      WHEN 'switch' THEN true
      WHEN 'image' THEN true
      WHEN 'color' THEN true
      WHEN 'sensor' THEN true
      WHEN 'range' THEN jsonb_typeof(c->'min') = 'number' AND jsonb_typeof(c->'max') = 'number'
        AND jsonb_typeof(c->'step') = 'number' AND (c->>'min')::numeric <= (c->>'max')::numeric AND (c->>'step')::numeric >= 0
      WHEN 'enum' THEN jsonb_array_length(pg_temp.voci(c->'values')) > 0
      ELSE false
    END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.riparata(c jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN c->>'kind' = 'enum' THEN jsonb_set(c, '{values}', pg_temp.voci(c->'values'))
    WHEN c->>'kind' = 'sensor' AND c ? 'values' AND jsonb_array_length(pg_temp.voci(c->'values')) > 0
      THEN jsonb_set(c, '{values}', pg_temp.voci(c->'values'))
    WHEN c->>'kind' = 'sensor' THEN c - 'values'
    ELSE c
  END
$$;--> statement-breakpoint
UPDATE "devices" d
SET "capabilities" = n."dopo"
FROM (
  SELECT d2."id", coalesce((
    SELECT jsonb_agg(x.cap ORDER BY x.i)
    FROM (
      SELECT DISTINCT ON (t.c->>'code') t.i, pg_temp.riparata(t.c) AS cap
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d2."capabilities") = 'array' THEN d2."capabilities" ELSE '[]'::jsonb END)
        WITH ORDINALITY AS t(c, i)
      WHERE pg_temp.ha_forma(t.c)
      ORDER BY t.c->>'code', t.i
    ) x
  ), '[]'::jsonb) AS "dopo"
  FROM "devices" d2
) n
WHERE n."id" = d."id" AND n."dopo" IS DISTINCT FROM d."capabilities";--> statement-breakpoint

-- Le prove — partenze, condizioni, avvisi — scritte su una capacità che
-- adesso l'agente racconta come un ordine: di un ordine si sa solo l'ultimo
-- dato, quindi non sarebbero mai scattate, e lasciate lì impedivano di
-- salvare la scena che le conteneva. Se ne vanno, e il padrone lo legge fra
-- i suoi avvisi con quali erano. Con loro se ne vanno anche le prove e le
-- righe rimaste su dispositivi che non esistono più: un dispositivo tolto
-- mentre si salvava una scena che lo nominava ci restava dentro.
CREATE FUNCTION pg_temp.capacita(device_id text, codice text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT c FROM "devices" d, jsonb_array_elements(d."capabilities") AS c
  WHERE d."id" = device_id AND c->>'code' = codice
  LIMIT 1
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.ordine(device_id text, codice text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(pg_temp.capacita(device_id, codice)->>'kind' = 'enum' AND pg_temp.capacita(device_id, codice)->'order' = 'true'::jsonb, false)
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.sparito(device_id text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "devices" WHERE "id" = device_id)
$$;--> statement-breakpoint
-- come `senza` di shared/regole.js: i gruppi rimasti vuoti se ne vanno, tranne quello più esterno;
-- uno che era già vuoto resta com'era, perché qui non c'era niente da togliere
CREATE FUNCTION pg_temp.pota(gruppo jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  restano jsonb := '[]'::jsonb;
  voce jsonb;
  dentro jsonb;
BEGIN
  FOR voce IN SELECT * FROM jsonb_array_elements(coalesce(gruppo->'items', '[]'::jsonb)) LOOP
    IF voce->>'kind' = 'group' THEN
      dentro := pg_temp.pota(voce);
      IF jsonb_array_length(dentro->'items') > 0 OR jsonb_array_length(coalesce(voce->'items', '[]'::jsonb)) = 0 THEN
        restano := restano || jsonb_build_array(dentro);
      END IF;
    ELSIF voce->>'kind' = 'device'
      AND (pg_temp.sparito(voce->>'deviceId') OR pg_temp.ordine(voce->>'deviceId', voce->>'code')) THEN
      NULL;
    ELSE
      restano := restano || jsonb_build_array(voce);
    END IF;
  END LOOP;
  RETURN jsonb_set(gruppo, '{items}', restano);
END
$$;--> statement-breakpoint
-- come `senzaRighe` di rules/chiamate.ts: l'attesa di una riga tolta passa alla riga dopo
CREATE FUNCTION pg_temp.senza_righe(righe jsonb, padrone text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  restano jsonb := '[]'::jsonb;
  riga jsonb;
  resta integer := 0;
  attesa integer;
BEGIN
  FOR riga IN SELECT * FROM jsonb_array_elements(righe) LOOP
    attesa := greatest(0, coalesce((riga->>'after')::integer, 0));
    IF (riga ? 'deviceId' AND pg_temp.sparito(riga->>'deviceId'))
      OR (riga ? 'scene' AND NOT EXISTS (SELECT 1 FROM "scenes" s WHERE s."id" = riga->>'scene' AND s."owner_id" = padrone)) THEN
      resta := resta + attesa;
      CONTINUE;
    END IF;
    riga := riga - 'after';
    IF attesa + resta > 0 THEN riga := riga || jsonb_build_object('after', attesa + resta); END IF;
    resta := 0;
    restano := restano || jsonb_build_array(riga);
  END LOOP;
  RETURN restano;
END
$$;--> statement-breakpoint
CREATE TEMPORARY TABLE "prove_tolte" AS
SELECT s."owner_id", 'la partenza su «' || coalesce(pg_temp.capacita(t->>'deviceId', t->>'code')->>'label', t->>'code')
    || '» del dispositivo «' || d."name" || '» nella scena «' || s."name" || '»' AS "cosa"
FROM "scenes" s
CROSS JOIN LATERAL jsonb_array_elements(s."triggers") AS t
JOIN "devices" d ON d."id" = t->>'deviceId'
WHERE pg_temp.ordine(t->>'deviceId', t->>'code')
UNION ALL
SELECT s."owner_id", 'la condizione su «' || coalesce(pg_temp.capacita(c->>'deviceId', c->>'code')->>'label', c->>'code')
    || '» del dispositivo «' || d."name" || '» nella scena «' || s."name" || '»'
FROM "scenes" s
CROSS JOIN LATERAL jsonb_path_query(s."conditions", 'strict $.**') AS c
JOIN "devices" d ON d."id" = c->>'deviceId'
WHERE jsonb_typeof(c) = 'object' AND c->>'kind' = 'device' AND pg_temp.ordine(c->>'deviceId', c->>'code')
UNION ALL
SELECT a."owner_id", 'l’avviso «' || a."says" || '»'
FROM "alerts" a
WHERE pg_temp.ordine(a."device_id", a."code");--> statement-breakpoint
INSERT INTO "notices" ("id", "owner_id", "kind", "title", "body", "short")
SELECT
  'avv-' || gen_random_uuid(),
  "owner_id",
  'scene',
  'Alcune scene e alcuni avvisi non guardano più certe cose',
  'L’agente adesso racconta alcune capacità in un altro modo, e su queste non si può più chiedere com’è una cosa o quando cambia. '
    || 'Le prove scritte su di loro non sarebbero mai scattate, e per questo se ne vanno '
    || string_agg("cosa", '; ' ORDER BY "cosa") || '.',
  'tolte le prove che non potevano più scattare'
FROM "prove_tolte"
GROUP BY "owner_id";--> statement-breakpoint
DROP TABLE "prove_tolte";--> statement-breakpoint
DELETE FROM "alerts" WHERE pg_temp.ordine("device_id", "code");--> statement-breakpoint
UPDATE "scenes" s
SET
  "triggers" = n."triggers",
  "conditions" = n."conditions",
  "steps" = n."steps"
FROM (
  SELECT
    s2."id",
    coalesce((
      SELECT jsonb_agg(t ORDER BY i)
      FROM jsonb_array_elements(s2."triggers") WITH ORDINALITY AS x(t, i)
      WHERE NOT (pg_temp.sparito(t->>'deviceId') OR pg_temp.ordine(t->>'deviceId', t->>'code'))
    ), '[]'::jsonb) AS "triggers",
    pg_temp.pota(s2."conditions") AS "conditions",
    pg_temp.senza_righe(s2."steps", s2."owner_id") AS "steps"
  FROM "scenes" s2
) n
WHERE n."id" = s."id"
  AND (n."triggers", n."conditions", n."steps") IS DISTINCT FROM (s."triggers", s."conditions", s."steps");--> statement-breakpoint

-- Gli elenchi dei luoghi aperti a un ospite, senza i luoghi che non ci sono
-- più: contavano un luogo che nessuno poteva più aprire. Un elenco rimasto
-- vuoto resta vuoto, che vuol dire nessun luogo, e non tutta la mappa.
UPDATE "map_editors" e
SET "places" = (
  SELECT coalesce(jsonb_agg(p ORDER BY n), '[]'::jsonb)
  FROM jsonb_array_elements_text(e."places") WITH ORDINALITY AS t(p, n)
  WHERE EXISTS (SELECT 1 FROM "places" l WHERE l."id" = t.p)
)
WHERE jsonb_typeof(e."places") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(e."places") AS p
    WHERE NOT EXISTS (SELECT 1 FROM "places" l WHERE l."id" = p)
  );
