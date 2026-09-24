CREATE TABLE "scene_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scene_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "alerts_device_code";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "quiet_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "quiet_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "blown_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scene_runs" ADD CONSTRAINT "scene_runs_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_runs" ADD CONSTRAINT "scene_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_runs_scene" ON "scene_runs" USING btree ("scene_id");--> statement-breakpoint
-- La stessa regola due volte mandava due avvisi per la stessa porta. Prima
-- dell'indice che lo impedisce, dei doppioni resta una accesa se ce n'è una
-- (false viene prima di true), e fra quelle la più vecchia: tenere una
-- spenta e buttare quella accesa spegneva un avviso che qualcuno riceveva.
DELETE FROM "alerts" a
USING "alerts" b
WHERE a."device_id" = b."device_id" AND a."code" = b."code" AND a."op" = b."op" AND a."becomes" = b."becomes"
  AND (a."off", a."created_at", a."id") > (b."off", b."created_at", b."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_same_rule" ON "alerts" USING btree ("device_id","code","op","becomes");--> statement-breakpoint
CREATE INDEX "scenes_triggers" ON "scenes" USING gin ("triggers");--> statement-breakpoint
-- Il fuso di una scena non lo leggeva nessuno: vale quello dell'account.
UPDATE "scenes" SET "timing" = "timing" - 'tz' WHERE "timing" ? 'tz';
--> statement-breakpoint
-- Chi tace, e da quando, lo diceva l'ultimo avviso di silenzio o di ripresa.
-- Adesso lo dice la sua riga: si parte da lì, così un silenzio già detto
-- non si ripete dopo l'aggiornamento.
UPDATE "agents" a
SET "quiet_since" = coalesce(n."since", n."at")
FROM (
  SELECT DISTINCT ON ("agent_id") "agent_id", "kind", "since", "at"
  FROM "notices"
  WHERE "device_id" IS NULL AND "agent_id" IS NOT NULL AND "kind" IN ('silent', 'back')
  ORDER BY "agent_id", "at" DESC
) n
WHERE n."agent_id" = a."id" AND n."kind" = 'silent';
--> statement-breakpoint
UPDATE "devices" d
SET "quiet_since" = coalesce(n."since", n."at")
FROM (
  SELECT DISTINCT ON ("device_id") "device_id", "kind", "since", "at"
  FROM "notices"
  WHERE "device_id" IS NOT NULL AND "kind" IN ('silent', 'back')
  ORDER BY "device_id", "at" DESC
) n
WHERE n."device_id" = d."id" AND n."kind" = 'silent';
