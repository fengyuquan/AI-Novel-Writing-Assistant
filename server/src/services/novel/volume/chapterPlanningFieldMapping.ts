import type { VolumeChapterPlan } from "@ai-novel/shared/types/novel";

export type CanonicalChapterPlanningFields = {
  id?: string | null;
  order: number;
  title: string;
  expectation?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
};

/**
 * Map execution-lane Chapter fields onto a volume planning chapter.
 *
 * Chapter.expectation is the execution goal and must hydrate `purpose`.
 * It must NOT overwrite planning `summary` (outline 章节摘要), otherwise
 * outline-imported summaries get replaced by 章节目标 after sync.
 */
export function applyCanonicalChapterFieldsToPlanChapter(
  chapter: VolumeChapterPlan,
  row: CanonicalChapterPlanningFields,
): VolumeChapterPlan {
  const expectation = row.expectation?.trim() || "";
  const existingSummary = chapter.summary?.trim() || "";
  const existingPurpose = chapter.purpose?.trim() || "";

  let nextPurpose = existingPurpose || null;
  let nextSummary = existingSummary;

  if (expectation) {
    nextPurpose = expectation;
  }

  if (!nextSummary) {
    // Legacy chapters only stored a single expectation blob. Recover that into
    // summary only when planning purpose was also empty before hydration.
    if (!existingPurpose && expectation) {
      nextSummary = expectation;
    } else {
      nextSummary = chapter.title?.trim() || row.title?.trim() || "";
    }
  }

  const conflictLevelSource: VolumeChapterPlan["conflictLevelSource"] =
    chapter.conflictLevelSource === "user" ? "user" : "ai";

  return {
    ...chapter,
    chapterId: row.id ?? chapter.chapterId ?? null,
    chapterOrder: row.order,
    title: row.title,
    summary: nextSummary,
    purpose: nextPurpose,
    targetWordCount: row.targetWordCount ?? null,
    conflictLevel: chapter.conflictLevelSource === "user"
      ? chapter.conflictLevel ?? null
      : row.conflictLevel ?? null,
    conflictLevelSource,
    revealLevel: row.revealLevel ?? null,
    mustAvoid: row.mustAvoid ?? null,
    taskSheet: row.taskSheet ?? null,
    sceneCards: row.sceneCards ?? null,
  };
}

/** Value written to Chapter.expectation when syncing planning → execution. */
export function resolveChapterExpectationFromPlan(chapter: Pick<VolumeChapterPlan, "purpose" | "summary">): string {
  return chapter.purpose?.trim() || chapter.summary?.trim() || "";
}
