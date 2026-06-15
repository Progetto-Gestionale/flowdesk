-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Preventivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "numero" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'preventivo',
    "clienteName" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "items" TEXT NOT NULL,
    "totale" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'bozza',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Preventivo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Preventivo" ("clienteEmail", "clienteName", "createdAt", "id", "items", "leadId", "note", "numero", "status", "totale", "updatedAt", "userId") SELECT "clienteEmail", "clienteName", "createdAt", "id", "items", "leadId", "note", "numero", "status", "totale", "updatedAt", "userId" FROM "Preventivo";
DROP TABLE "Preventivo";
ALTER TABLE "new_Preventivo" RENAME TO "Preventivo";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
