import type { VolumePlan } from "../types/novel";
import type {
  OutlineImportConflictChoice,
  OutlineImportConflictItem,
  OutlineImportPendingAlignmentItem,
} from "../types/outlineImportConflict";

function appendMustAvoidNote(current: string | null | undefined, note: string): string {
  const existing = (current ?? "").trim();
  const piece = note.trim();
  if (!piece) {
    return existing;
  }
  if (existing.includes(piece)) {
    return existing;
  }
  return existing ? `${existing}\n${piece}` : piece;
}

function chapterMatchesConflict(
  chapter: VolumePlan["chapters"][number],
  conflict: OutlineImportConflictItem,
): boolean {
  const order = conflict.outlineRef.chapterOrder;
  const title = conflict.outlineRef.chapterTitle?.trim();
  if (typeof order === "number" && order > 0 && chapter.chapterOrder === order) {
    return true;
  }
  if (title && chapter.title.trim() === title) {
    return true;
  }
  return false;
}

/**
 * Apply per-conflict choices onto imported volume draft.
 * keep_setting appends compliance notes to mustAvoid; does not rewrite summary/title.
 */
export function applyOutlineImportConflictChoices(params: {
  volumes: VolumePlan[];
  conflicts: OutlineImportConflictItem[];
  choices: Record<string, OutlineImportConflictChoice>;
  now?: string;
}): {
  volumes: VolumePlan[];
  pendingAlignments: OutlineImportPendingAlignmentItem[];
} {
  const now = params.now ?? new Date().toISOString();
  const nextVolumes = params.volumes.map((volume) => ({
    ...volume,
    chapters: volume.chapters.map((chapter) => ({ ...chapter })),
  }));

  const pendingAlignments: OutlineImportPendingAlignmentItem[] = [];

  for (const conflict of params.conflicts) {
    const choice = params.choices[conflict.conflictId] ?? conflict.recommendedChoice;
    if (choice === "keep_setting") {
      const note = `须符合既有设定（${conflict.settingRef.label}）：${conflict.settingRef.excerpt || conflict.summary}`;
      for (const volume of nextVolumes) {
        for (const chapter of volume.chapters) {
          if (!chapterMatchesConflict(chapter, conflict)) {
            continue;
          }
          chapter.mustAvoid = appendMustAvoidNote(chapter.mustAvoid, note);
          chapter.updatedAt = now;
        }
      }
      continue;
    }

    pendingAlignments.push({
      conflictId: conflict.conflictId,
      category: conflict.category,
      title: conflict.title,
      summary: conflict.summary,
      settingLabel: conflict.settingRef.label,
      chapterTitle: conflict.outlineRef.chapterTitle ?? null,
      chapterOrder: conflict.outlineRef.chapterOrder ?? null,
      choice,
      createdAt: now,
    });
  }

  return {
    volumes: nextVolumes,
    pendingAlignments,
  };
}
