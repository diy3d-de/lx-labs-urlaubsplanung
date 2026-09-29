-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vacation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vacation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Vacation" ("createdAt", "endDate", "id", "note", "personId", "startDate") SELECT "createdAt", "endDate", "id", "note", "personId", "startDate" FROM "Vacation";
DROP TABLE "Vacation";
ALTER TABLE "new_Vacation" RENAME TO "Vacation";
CREATE INDEX "Vacation_personId_idx" ON "Vacation"("personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
