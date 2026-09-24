-- Chi può modificare una mappa non è più un'email scritta dentro alla mappa
-- ma un account, entrato con un link d'invito. Prima chiunque si iscrivesse
-- con una di quelle email ereditava la mappa senza che nessuno avesse
-- controllato che l'email fosse sua.
CREATE TABLE "map_editors" (
	"map_id" text NOT NULL,
	"user_id" text NOT NULL,
	"places" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_editors_map_id_user_id_pk" PRIMARY KEY("map_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "map_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "map_invites_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "map_editors" ADD CONSTRAINT "map_editors_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_editors" ADD CONSTRAINT "map_editors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_invites" ADD CONSTRAINT "map_invites_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_invites" ADD CONSTRAINT "map_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_editors_user" ON "map_editors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "map_invites_map" ON "map_invites" USING btree ("map_id");--> statement-breakpoint
-- Le email che sono già di un account diventano editor di quell'account,
-- con gli stessi luoghi di prima. Il padrone non è editor di casa sua.
INSERT INTO "map_editors" ("map_id", "user_id", "places")
SELECT DISTINCT ON (m."id", u."id")
  m."id",
  u."id",
  CASE WHEN jsonb_typeof(e->'only') = 'array' THEN e->'only' ELSE NULL END
FROM "maps" m
CROSS JOIN LATERAL jsonb_array_elements(m."editors") AS e
JOIN "users" u ON u."email" = lower(e->>'email')
WHERE u."id" <> m."owner_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Quelle che non sono di nessun account non possono diventare un editor, e
-- un link non si manda da solo. Si tolgono, e il padrone lo legge fra i suoi
-- avvisi con le email che c'erano, per mandare un link a chi serve ancora.
INSERT INTO "notices" ("id", "owner_id", "kind", "title", "body", "who", "short")
SELECT
  'avv-' || gen_random_uuid(),
  m."owner_id",
  'map',
  'La mappa «' || m."name" || '» non si apre più ad alcune email',
  'Le mappe adesso si aprono con un link d''invito, legato all''account di chi lo apre. Queste email non erano di nessun account iscritto, quindi non potevano diventare un editor: '
    || string_agg(lower(e->>'email'), ', ' ORDER BY lower(e->>'email'))
    || '. Se a qualcuno serve ancora, crea un link d''invito dalla pagina delle mappe e mandaglielo.',
  m."name",
  'non si apre più a ' || string_agg(lower(e->>'email'), ', ' ORDER BY lower(e->>'email'))
FROM "maps" m
CROSS JOIN LATERAL jsonb_array_elements(m."editors") AS e
WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."email" = lower(e->>'email'))
GROUP BY m."id", m."owner_id", m."name";--> statement-breakpoint
ALTER TABLE "maps" DROP COLUMN "editors";