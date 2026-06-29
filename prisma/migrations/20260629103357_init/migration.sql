-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setName" TEXT,
    "cardNumber" TEXT,
    "language" TEXT,
    "externalId" TEXT,
    "imageUrl" TEXT,
    "condition" TEXT,
    "gradingCompany" TEXT,
    "grade" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "purchasePrice" REAL NOT NULL DEFAULT 0,
    "marketValue" REAL NOT NULL DEFAULT 0,
    "marketValueSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "marketValueUpdatedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Item_userId_idx" ON "Item"("userId");
