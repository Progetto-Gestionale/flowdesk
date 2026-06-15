-- CreateTable
CREATE TABLE "Preventivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
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
