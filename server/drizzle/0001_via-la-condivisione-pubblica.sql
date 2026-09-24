DROP INDEX "maps_owner_slug";--> statement-breakpoint
CREATE INDEX "maps_owner" ON "maps" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "maps" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "maps" DROP COLUMN "published";--> statement-breakpoint
ALTER TABLE "maps" DROP COLUMN "views";--> statement-breakpoint
ALTER TABLE "maps" DROP COLUMN "viewers";--> statement-breakpoint
ALTER TABLE "maps" DROP COLUMN "views_from_profile";--> statement-breakpoint
ALTER TABLE "places" DROP COLUMN "private";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "profile_views";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "profile_viewers";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "profile_followed";