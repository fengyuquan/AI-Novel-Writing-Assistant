CREATE TABLE "ChapterStyleBenchmarkCache" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 2,
  "selectedSourceKey" TEXT,
  "sessionJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChapterStyleBenchmarkCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChapterStyleBenchmarkCache_chapterId_key" ON "ChapterStyleBenchmarkCache"("chapterId");
CREATE UNIQUE INDEX "ChapterStyleBenchmarkCache_novelId_chapterId_key" ON "ChapterStyleBenchmarkCache"("novelId", "chapterId");
CREATE INDEX "ChapterStyleBenchmarkCache_novelId_updatedAt_idx" ON "ChapterStyleBenchmarkCache"("novelId", "updatedAt");

ALTER TABLE "ChapterStyleBenchmarkCache" ADD CONSTRAINT "ChapterStyleBenchmarkCache_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterStyleBenchmarkCache" ADD CONSTRAINT "ChapterStyleBenchmarkCache_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
