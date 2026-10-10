-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "option0" TEXT NOT NULL,
    "option1" TEXT NOT NULL,
    "option2" TEXT NOT NULL,
    "option3" TEXT NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "source" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "normalizedText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomCode" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "endedEarly" BOOLEAN NOT NULL DEFAULT false,
    "questionCount" INTEGER NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_normalizedText_key" ON "Question"("normalizedText");

-- CreateIndex
CREATE INDEX "Question_categoryId_difficulty_active_idx" ON "Question"("categoryId", "difficulty", "active");

-- CreateIndex
CREATE INDEX "GameRecord_endedAt_idx" ON "GameRecord"("endedAt");
