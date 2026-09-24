CREATE INDEX "devices_watched" ON "devices" USING btree ("id") WHERE watch;--> statement-breakpoint
CREATE INDEX "scenes_timed" ON "scenes" USING btree ("id") WHERE timing is not null;--> statement-breakpoint
-- Un silenzio già detto su un dispositivo che nessuno sorveglia più resta
-- scritto, e riaccendendo la sorveglianza arrivava «ha ripreso a rispondere
-- dopo tre giorni». Adesso si dimentica quando la sorveglianza si spegne, e
-- qui per quelli spenti prima.
UPDATE "devices" SET "quiet_since" = NULL WHERE NOT "watch" AND "quiet_since" IS NOT NULL;
