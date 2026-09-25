-- Un avviso scattato da una regola su un dispositivo ha un tipo suo, `rule`:
-- scritto come `scene`, il registro lo metteva sotto «Scena» con il nome del
-- dispositivo. Sono le righe con un dispositivo, perché quelle delle scene
-- (un passo «avvisami», il fusibile) non ne hanno mai uno.
UPDATE "notices" SET "kind" = 'rule' WHERE "kind" = 'scene' AND "device_id" IS NOT NULL;
