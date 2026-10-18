-- Zufällige Kennung der Datenbank: Ein Mobilgerät, das mit einer anderen (oder neu angelegten) Datenbank
-- synchronisiert war, erkennt daran, dass es einen vollständigen Neuabgleich braucht.
ALTER TABLE "SyncCounter" ADD COLUMN "dbId" TEXT NOT NULL DEFAULT '';
UPDATE "SyncCounter" SET "dbId" = lower(hex(randomblob(16))) WHERE "id" = 1;
