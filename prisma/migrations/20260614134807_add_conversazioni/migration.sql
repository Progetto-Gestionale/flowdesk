-- CreateTable
CREATE TABLE "Conversazione" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clienteNome" TEXT,
    "clienteEmail" TEXT,
    "canale" TEXT NOT NULL DEFAULT 'chat',
    "messaggi" TEXT NOT NULL,
    "letta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversazione_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
