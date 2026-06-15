/*
  Warnings:

  - You are about to drop the column `giornoSettimana` on the `SlotDisponibile` table. All the data in the column will be lost.
  - Added the required column `data` to the `SlotDisponibile` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SlotDisponibile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "data" DATETIME NOT NULL,
    "oraInizio" TEXT NOT NULL,
    "oraFine" TEXT NOT NULL,
    "durata" INTEGER NOT NULL DEFAULT 60,
    CONSTRAINT "SlotDisponibile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
DELETE FROM "SlotDisponibile";
DROP TABLE "SlotDisponibile";
ALTER TABLE "new_SlotDisponibile" RENAME TO "SlotDisponibile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
