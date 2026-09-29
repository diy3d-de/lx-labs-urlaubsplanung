-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "order" INTEGER NOT NULL DEFAULT 0,
    "vacationDays" REAL NOT NULL DEFAULT 30,
    "heiligabendHalf" BOOLEAN NOT NULL DEFAULT true,
    "silvesterHalf" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Person" ("color", "createdAt", "id", "isStudent", "name", "order") SELECT "color", "createdAt", "id", "isStudent", "name", "order" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
