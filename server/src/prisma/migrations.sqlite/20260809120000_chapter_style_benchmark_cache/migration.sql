CREATE TABLE "ChapterStyleBenchmarkCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 2,
  "selectedSourceKey" TEXT,
  "sessionJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ChapterStyleBenchmarkCache_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChapterStyleBenchmarkCache_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ChapterStyleBenchmarkCache_chapterId_key" ON "ChapterStyleBenchmarkCache"("chapterId");
CREATE UNIQUE INDEX "ChapterStyleBenchmarkCache_novelId_chapterId_key" ON "ChapterStyleBenchmarkCache"("novelId", "chapterId");
CREATE INDEX "ChapterStyleBenchmarkCache_novelId_updatedAt_idx" ON "ChapterStyleBenchmarkCache"("novelId", "updatedAt");
