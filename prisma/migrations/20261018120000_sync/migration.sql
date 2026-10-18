-- Abgleich mit der Mobile-App: globaler Änderungszähler, rev je Datensatz und Tombstones für Löschungen.
-- rev und Tombstones pflegen Trigger, damit jeder Schreibweg (API, Import, Sync) automatisch erfasst wird.

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Vacation" ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Tombstone" (
    "entity" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "rev" INTEGER NOT NULL,

    PRIMARY KEY ("entity", "id")
);

-- CreateTable
CREATE TABLE "SyncCounter" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "Tombstone_rev_idx" ON "Tombstone"("rev");

-- Bestehende Daten bekommen rev 1, damit der erste Abgleich (Cursor 0) alles liefert
INSERT INTO "SyncCounter" ("id", "value") VALUES (1, 1);
UPDATE "Person" SET "rev" = 1;
UPDATE "Vacation" SET "rev" = 1;
UPDATE "Settings" SET "rev" = 1;

-- Person
CREATE TRIGGER "Person_rev_insert" AFTER INSERT ON "Person" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    UPDATE "Person" SET "rev" = (SELECT "value" FROM "SyncCounter" WHERE "id" = 1) WHERE "id" = NEW."id";
END;
CREATE TRIGGER "Person_rev_update" AFTER UPDATE ON "Person" WHEN NEW."rev" = OLD."rev" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    UPDATE "Person" SET "rev" = (SELECT "value" FROM "SyncCounter" WHERE "id" = 1) WHERE "id" = NEW."id";
END;
CREATE TRIGGER "Person_tombstone" AFTER DELETE ON "Person" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    INSERT OR REPLACE INTO "Tombstone" ("entity", "id", "rev")
        VALUES ('person', OLD."id", (SELECT "value" FROM "SyncCounter" WHERE "id" = 1));
END;

-- Vacation (ON DELETE CASCADE löst den Delete-Trigger ebenfalls aus)
CREATE TRIGGER "Vacation_rev_insert" AFTER INSERT ON "Vacation" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    UPDATE "Vacation" SET "rev" = (SELECT "value" FROM "SyncCounter" WHERE "id" = 1) WHERE "id" = NEW."id";
END;
CREATE TRIGGER "Vacation_rev_update" AFTER UPDATE ON "Vacation" WHEN NEW."rev" = OLD."rev" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    UPDATE "Vacation" SET "rev" = (SELECT "value" FROM "SyncCounter" WHERE "id" = 1) WHERE "id" = NEW."id";
END;
CREATE TRIGGER "Vacation_tombstone" AFTER DELETE ON "Vacation" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    INSERT OR REPLACE INTO "Tombstone" ("entity", "id", "rev")
        VALUES ('vacation', OLD."id", (SELECT "value" FROM "SyncCounter" WHERE "id" = 1));
END;

-- Settings (nur echte Änderungen zählen; GET /api/settings macht ein Upsert ohne Änderung)
CREATE TRIGGER "Settings_rev_insert" AFTER INSERT ON "Settings" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    UPDATE "Settings" SET "rev" = (SELECT "value" FROM "SyncCounter" WHERE "id" = 1) WHERE "id" = NEW."id";
END;
CREATE TRIGGER "Settings_rev_update" AFTER UPDATE ON "Settings"
    WHEN NEW."rev" = OLD."rev" AND NEW."bundesland" IS NOT OLD."bundesland" BEGIN
    UPDATE "SyncCounter" SET "value" = "value" + 1 WHERE "id" = 1;
    UPDATE "Settings" SET "rev" = (SELECT "value" FROM "SyncCounter" WHERE "id" = 1) WHERE "id" = NEW."id";
END;
