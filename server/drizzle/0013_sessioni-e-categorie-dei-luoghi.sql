-- Ogni token porta il numero delle sessioni di chi l'ha avuto, e vale finché
-- è ancora quello. I token di prima non ne portano nessuno, quindi chi era
-- dentro rientra una volta: un token che non si può revocare non si tiene.
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Prima del vincolo, i luoghi rimasti con una categoria che non c'è più:
-- sono nati mentre la loro categoria veniva tolta. Non si buttano, perché
-- nessuno ha chiesto di toglierli: vanno in una categoria «Senza categoria»
-- del padrone della mappa, e il padrone lo legge fra i suoi avvisi con i
-- loro nomi, per spostarli o per toglierli insieme a quella categoria.
CREATE TEMPORARY TABLE "senza_categoria" AS
SELECT m."owner_id", 'cat-' || gen_random_uuid() AS "category_id"
FROM "places" p
JOIN "maps" m ON m."id" = p."map_id"
WHERE NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = p."category_id")
GROUP BY m."owner_id";--> statement-breakpoint
INSERT INTO "categories" ("id", "owner_id", "name", "emoji", "color")
SELECT "category_id", "owner_id", 'Senza categoria', 'pin', '#2274a5' FROM "senza_categoria";--> statement-breakpoint
INSERT INTO "notices" ("id", "owner_id", "kind", "title", "body", "who", "short")
SELECT
  'avv-' || gen_random_uuid(),
  s."owner_id",
  'map',
  'Alcuni luoghi sono nella categoria «Senza categoria»',
  'La loro categoria era stata tolta mentre venivano scritti, quindi erano rimasti senza. Adesso stanno in «Senza categoria», da dove puoi spostarli dove vuoi, oppure puoi togliere quella categoria, e se ne vanno con lei. I luoghi sono '
    || string_agg('«' || p."name" || '»', ', ' ORDER BY p."name") || '.',
  'Senza categoria',
  'raccoglie ' || string_agg('«' || p."name" || '»', ', ' ORDER BY p."name")
FROM "senza_categoria" s
JOIN "maps" m ON m."owner_id" = s."owner_id"
JOIN "places" p ON p."map_id" = m."id"
WHERE NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = p."category_id")
GROUP BY s."owner_id";--> statement-breakpoint
UPDATE "places" p
SET "category_id" = s."category_id"
FROM "maps" m, "senza_categoria" s
WHERE m."id" = p."map_id" AND s."owner_id" = m."owner_id"
  AND NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = p."category_id");--> statement-breakpoint
DROP TABLE "senza_categoria";--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_category" ON "places" USING btree ("category_id");