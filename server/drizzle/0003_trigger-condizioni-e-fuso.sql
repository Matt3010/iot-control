ALTER TABLE "alerts" ADD COLUMN "op" text DEFAULT 'is' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "triggers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tz" text;