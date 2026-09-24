ALTER TABLE "scenes" ALTER COLUMN "conditions" SET DEFAULT '{"id":"radice","kind":"group","match":"all","items":[]}'::jsonb;--> statement-breakpoint
-- Le condizioni scritte finora valevano tutte insieme: diventano un gruppo
-- solo che le chiede tutte, e la scena parte negli stessi momenti di prima.
UPDATE "scenes"
SET "conditions" = jsonb_build_object('id', 'radice', 'kind', 'group', 'match', 'all', 'items', "conditions")
WHERE jsonb_typeof("conditions") = 'array';
