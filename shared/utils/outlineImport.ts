import type { VolumeChapterPlan, VolumePlan } from "../types/novel";

export type ImportedOutlineChapter = {
  title: string;
  summary: string;
  purpose?: string | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  /** Optional stage/act label from `### 第N阶段：...` headings. */
  stageLabel?: string | null;
};

export type ImportedOutlineVolume = {
  title: string;
  chapters: ImportedOutlineChapter[];
};

export type OutlineParseConfidence = "high" | "low";

export type ParsedChapterOutline = {
  volumes: ImportedOutlineVolume[];
  confidence: OutlineParseConfidence;
  issues: string[];
  chapterCount: number;
  hasVolumeMarkers: boolean;
};

/** `#/#/# # 第N卷 标题` */
const VOLUME_HEADING_RE = /^(?:#{1,3}|＃{1,3})\s*(?:第\s*([0-9０-９一二三四五六七八九十百千两]+)\s*卷[.、:：\s-]*)(.+)$/u;
/** `### 第N阶段：标题` / `## 第一阶段 标题` */
const STAGE_HEADING_RE = /^(?:#{1,3}|＃{1,3})\s*(?:第\s*([0-9０-９一二三四五六七八九十百千两]+)\s*阶段[.、:：\s-]*)(.+)$/u;
/** `## 第N章 标题` */
const HASH_CHAPTER_RE = /^(?:##|＃＃)\s*(?:第\s*([0-9０-９一二三四五六七八九十百千两]+)\s*[章节回][.、:：\s-]*)(.+)$/u;
/** `# 第N章 标题` */
const SINGLE_HASH_CHAPTER_RE = /^(?:#|＃)\s*(?:第\s*([0-9０-９一二三四五六七八九十百千两]+)\s*[章节回][.、:：\s-]*)(.+)$/u;
/** `## 1. 标题` */
const HASH_NUMBERED_CHAPTER_RE = /^(?:##|＃＃)\s*([0-9]+)\s*[.、:：]\s*(.+)$/u;
/**
 * `**第1章：标题**` / `第1章：标题`
 * 排除区间：`第1-3章` / `第1~10章`
 */
const EXPLICIT_CHAPTER_RE = /^(?:\*{1,2}\s*)?第\s*([0-9０-９一二三四五六七八九十百千两]+)\s*章\s*[:：]\s*(.+?)(?:\s*\*{1,2})?\s*$/u;
const CHAPTER_RANGE_RE = /第\s*[0-9０-９一二三四五六七八九十百千两]+\s*[-~～—到至]\s*[0-9０-９一二三四五六七八九十百千两]+/u;
const LOOSE_NUMBERED_CHAPTER_RE = /^(?:第\s*[0-9０-９一二三四五六七八九十百千两]+\s*[章节回][.、:：\s-]*)?(?:([0-9]+)\s*[.、:：]\s+)(.+)$/u;
const LABELED_LINE_RE = /^(?:\*\s*)?(?:\*{1,2})?(章节摘要|章节目标|章节任务单|摘要|概要|内容|必写|必含|目的|目标|禁写|避免|summary|purpose|mustAvoid|taskSheet)(?:\*{1,2})?\s*[:：]\s*(.*)$/iu;

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTitle(value: string): string {
  return value
    .replace(/^\*{1,2}/, "")
    .replace(/\*{1,2}$/, "")
    .replace(/^[#＃\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendParagraph(current: string, next: string): string {
  const piece = next.trim();
  if (!piece) {
    return current;
  }
  return current ? `${current}\n${piece}` : piece;
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^(?:[-*•]\s+|\d+\.\s+)/, "").trim();
}

function parseArabicChapterNo(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseChapterRangeFromTitle(title: string): { start: number; end: number } | null {
  const match = title.match(/第\s*(\d+)\s*[-~～—到至]\s*(\d+)\s*章/u);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
    return null;
  }
  return { start, end };
}

function isHighConfidence(params: {
  chapterCount: number;
  explicitChapterCount: number;
}): boolean {
  return params.chapterCount >= 1 && params.explicitChapterCount >= 1
    && params.explicitChapterCount === params.chapterCount;
}

/**
 * Deterministic outline parser.
 * Content is copied as-is into fields; only structure/format is inferred.
 */
export function parseChapterOutlineMarkdown(text: string): ParsedChapterOutline {
  const issues: string[] = [];
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return {
      volumes: [],
      confidence: "low",
      issues: ["请先粘贴大纲文本。"],
      chapterCount: 0,
      hasVolumeMarkers: false,
    };
  }

  const volumes: ImportedOutlineVolume[] = [];
  const volumeRanges = new Map<ImportedOutlineVolume, { start: number; end: number }>();
  const state: {
    currentVolume: ImportedOutlineVolume | null;
    currentChapter: ImportedOutlineChapter | null;
    currentStageLabel: string | null;
    explicitChapterCount: number;
    hasVolumeMarkers: boolean;
    taskSheetMode: boolean;
  } = {
    currentVolume: null,
    currentChapter: null,
    currentStageLabel: null,
    explicitChapterCount: 0,
    hasVolumeMarkers: false,
    taskSheetMode: false,
  };

  const ensureVolume = (title?: string) => {
    if (!state.currentVolume) {
      state.currentVolume = {
        title: title?.trim() || "第1卷",
        chapters: [],
      };
      volumes.push(state.currentVolume);
    } else if (title?.trim()) {
      state.currentVolume.title = title.trim();
    }
    return state.currentVolume;
  };

  const flushChapter = () => {
    const currentChapter = state.currentChapter;
    if (!currentChapter) {
      return;
    }
    const title = normalizeTitle(currentChapter.title);
    if (!title) {
      issues.push("存在缺少标题的章节块，已跳过。");
      state.currentChapter = null;
      state.taskSheetMode = false;
      return;
    }
    currentChapter.title = title;
    currentChapter.summary = currentChapter.summary.trim() || title;
    if (currentChapter.purpose) {
      currentChapter.purpose = currentChapter.purpose.trim() || null;
    }
    if (currentChapter.mustAvoid) {
      currentChapter.mustAvoid = currentChapter.mustAvoid.trim() || null;
    }
    if (currentChapter.taskSheet) {
      currentChapter.taskSheet = currentChapter.taskSheet.trim() || null;
    }
    ensureVolume().chapters.push(currentChapter);
    state.currentChapter = null;
    state.taskSheetMode = false;
  };

  const selectVolumeForChapterNo = (chapterNo: number | null) => {
    if (chapterNo == null || volumeRanges.size === 0) {
      return;
    }
    for (const volume of volumes) {
      const range = volumeRanges.get(volume);
      if (range && chapterNo >= range.start && chapterNo <= range.end) {
        state.currentVolume = volume;
        return;
      }
    }
  };

  const startChapter = (title: string, explicit: boolean, chapterNo: number | null = null) => {
    flushChapter();
    if (explicit) {
      state.explicitChapterCount += 1;
    }
    selectVolumeForChapterNo(chapterNo);
    state.currentChapter = {
      title: normalizeTitle(title) || `第${chapterNo || state.explicitChapterCount || 1}章`,
      summary: "",
      purpose: null,
      mustAvoid: null,
      taskSheet: null,
      stageLabel: state.currentStageLabel,
    };
    ensureVolume();
  };

  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const volumeMatch = line.match(VOLUME_HEADING_RE);
    if (volumeMatch) {
      flushChapter();
      state.hasVolumeMarkers = true;
      state.currentStageLabel = null;
      const title = normalizeTitle(volumeMatch[2] || `第${volumeMatch[1] || volumes.length + 1}卷`);
      state.currentVolume = { title: title || `第${volumes.length + 1}卷`, chapters: [] };
      volumes.push(state.currentVolume);
      const range = parseChapterRangeFromTitle(line);
      if (range) {
        volumeRanges.set(state.currentVolume, range);
      }
      continue;
    }

    const stageMatch = line.match(STAGE_HEADING_RE);
    if (stageMatch) {
      flushChapter();
      const stageTitle = normalizeTitle(stageMatch[2] || `第${stageMatch[1] || ""}阶段`);
      state.currentStageLabel = stageTitle || state.currentStageLabel;
      continue;
    }

    if (CHAPTER_RANGE_RE.test(line) && !EXPLICIT_CHAPTER_RE.test(stripBulletPrefix(line).replace(/^\*{1,2}/, "").replace(/\*{1,2}$/, ""))) {
      // 区间章（如 第1-3章）不是单章标题，跳过，避免误识别
      continue;
    }

    const hashChapter = line.match(HASH_CHAPTER_RE);
    if (hashChapter) {
      startChapter(hashChapter[2] || `第${hashChapter[1]}章`, true, parseArabicChapterNo(hashChapter[1]));
      continue;
    }

    const singleHashChapter = line.match(SINGLE_HASH_CHAPTER_RE);
    if (singleHashChapter) {
      startChapter(
        singleHashChapter[2] || `第${singleHashChapter[1]}章`,
        true,
        parseArabicChapterNo(singleHashChapter[1]),
      );
      continue;
    }

    const hashNumbered = line.match(HASH_NUMBERED_CHAPTER_RE);
    if (hashNumbered) {
      startChapter(hashNumbered[2], true, parseArabicChapterNo(hashNumbered[1]));
      continue;
    }

    const explicitSource = stripBulletPrefix(line);
    const explicitChapter = explicitSource.match(EXPLICIT_CHAPTER_RE);
    if (explicitChapter) {
      startChapter(explicitChapter[2], true, parseArabicChapterNo(explicitChapter[1]));
      continue;
    }

    const activeChapter = state.currentChapter;
    if (!activeChapter) {
      const loose = line.match(LOOSE_NUMBERED_CHAPTER_RE);
      if (loose) {
        // 无明确「第N章」时的弱匹配，不计入 explicit，最终置信度为 low
        startChapter(loose[2], false);
      }
      continue;
    }

    const labeledSource = stripBulletPrefix(line);
    const labeled = labeledSource.match(LABELED_LINE_RE);
    if (labeled) {
      const key = labeled[1].toLowerCase();
      const value = labeled[2] ?? "";
      state.taskSheetMode = key === "章节任务单" || key === "tasksheet";
      if (key === "章节摘要" || key === "摘要" || key === "概要" || key === "内容" || key === "summary") {
        activeChapter.summary = appendParagraph(activeChapter.summary, value);
      } else if (
        key === "章节目标"
        || key === "必写"
        || key === "必含"
        || key === "目的"
        || key === "目标"
        || key === "purpose"
      ) {
        activeChapter.purpose = appendParagraph(activeChapter.purpose ?? "", value);
      } else if (key === "禁写" || key === "避免" || key === "mustavoid") {
        activeChapter.mustAvoid = appendParagraph(activeChapter.mustAvoid ?? "", value);
      } else if (state.taskSheetMode) {
        activeChapter.taskSheet = appendParagraph(activeChapter.taskSheet ?? "", value);
      }
      continue;
    }

    if (state.taskSheetMode) {
      activeChapter.taskSheet = appendParagraph(activeChapter.taskSheet ?? "", stripBulletPrefix(line));
      continue;
    }

    activeChapter.summary = appendParagraph(activeChapter.summary, line);
  }

  flushChapter();
  const explicitChapterCount = state.explicitChapterCount;
  const hasVolumeMarkers = state.hasVolumeMarkers;

  const chapterCount = volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
  if (chapterCount === 0) {
    issues.push("未能识别章节标题。可使用「## 第1章 标题」或「**第1章：标题**」，也可改用 AI 仅做格式整理。");
  }

  if (!hasVolumeMarkers && volumes.length === 1 && !volumes[0]?.title) {
    volumes[0].title = "第1卷";
  }

  // Long-line volume plans often declare 卷标题 without per-chapter bodies.
  // Keep only volumes that actually received chapters so preview/create stay usable.
  const emptyVolumeCount = volumes.filter((volume) => volume.chapters.length === 0).length;
  if (chapterCount > 0 && emptyVolumeCount > 0) {
    const kept = volumes.filter((volume) => volume.chapters.length > 0);
    volumes.length = 0;
    volumes.push(...kept);
    issues.push(`已忽略 ${emptyVolumeCount} 个没有具体章节的卷标题（多为长线规划摘要，不会写入空卷）。`);
  }

  const confidence: OutlineParseConfidence = isHighConfidence({
    chapterCount,
    explicitChapterCount,
  })
    ? "high"
    : "low";

  if (confidence === "low" && chapterCount > 0 && explicitChapterCount === 0) {
    issues.push("未识别到明确的「第N章」标题，模板置信度不足；可用 AI 仅做格式整理，或改成标准章标题。");
  }

  return {
    volumes,
    confidence,
    issues,
    chapterCount,
    hasVolumeMarkers: hasVolumeMarkers && volumes.length > 0,
  };
}

function emptyVolumeShell(params: {
  novelId: string;
  sortOrder: number;
  title: string;
  now: string;
  id?: string;
}): VolumePlan {
  return {
    id: params.id || createLocalId("volume"),
    novelId: params.novelId,
    sortOrder: params.sortOrder,
    title: params.title,
    summary: "",
    openingHook: "",
    mainPromise: "",
    primaryPressureSource: "",
    coreSellingPoint: "",
    escalationMode: "",
    protagonistChange: "",
    midVolumeRisk: "",
    climax: "",
    payoffType: "",
    nextVolumeHook: "",
    resetPoint: "",
    openPayoffs: [],
    status: "draft",
    sourceVersionId: null,
    chapters: [],
    createdAt: params.now,
    updatedAt: params.now,
  };
}

function toVolumeChapter(params: {
  volumeId: string;
  chapter: ImportedOutlineChapter;
  chapterOrder: number;
  now: string;
}): VolumeChapterPlan {
  return {
    id: createLocalId("chapter"),
    volumeId: params.volumeId,
    chapterId: null,
    chapterOrder: params.chapterOrder,
    beatKey: null,
    title: params.chapter.title.trim(),
    summary: params.chapter.summary.trim() || params.chapter.title.trim(),
    purpose: params.chapter.purpose?.trim() || null,
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: null,
    conflictLevelSource: "user",
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: params.chapter.mustAvoid?.trim() || null,
    taskSheet: params.chapter.taskSheet?.trim() || null,
    sceneCards: null,
    styleContract: null,
    payoffRefs: [],
    createdAt: params.now,
    updatedAt: params.now,
  };
}

/**
 * Replace book chapter lists with imported outline.
 * Preserves existing volume metadata when possible.
 */
export function mergeImportedOutlineIntoVolumes(
  existingVolumes: VolumePlan[],
  parsed: ParsedChapterOutline,
  options: { novelId: string; now?: string },
): VolumePlan[] {
  const now = options.now ?? new Date().toISOString();
  const novelId = options.novelId;
  if (parsed.chapterCount < 1 || parsed.volumes.length === 0) {
    throw new Error("导入结果没有可用章节。");
  }

  const sortedExisting = existingVolumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const importedVolumes = parsed.hasVolumeMarkers
    ? parsed.volumes
    : [{
        title: sortedExisting[0]?.title || parsed.volumes[0]?.title || "第1卷",
        chapters: parsed.volumes.flatMap((volume) => volume.chapters),
      }];

  const targetCount = Math.max(importedVolumes.length, sortedExisting.length, 1);
  const nextVolumes: VolumePlan[] = [];
  let chapterOrder = 1;

  for (let index = 0; index < targetCount; index += 1) {
    const existing = sortedExisting[index];
    const imported = importedVolumes[index];
    const shell = existing
      ? {
          ...existing,
          sortOrder: index + 1,
          updatedAt: now,
          chapters: [] as VolumeChapterPlan[],
        }
      : emptyVolumeShell({
          novelId,
          sortOrder: index + 1,
          title: imported?.title || `第${index + 1}卷`,
          now,
        });

    if (imported?.title?.trim() && parsed.hasVolumeMarkers) {
      shell.title = imported.title.trim();
    } else if (imported?.title?.trim() && !existing) {
      shell.title = imported.title.trim();
    }

    const chapters = (imported?.chapters ?? []).map((chapter) => {
      const mapped = toVolumeChapter({
        volumeId: shell.id,
        chapter,
        chapterOrder,
        now,
      });
      chapterOrder += 1;
      return mapped;
    });

    nextVolumes.push({
      ...shell,
      chapters,
    });
  }

  return nextVolumes;
}

export const CHAPTER_OUTLINE_IMPORT_TEMPLATE = `# 第1卷 卷名（可选）

## 第1章 章名
摘要：这一章发生什么、局面如何变化
必写：必须写到的关键点
禁写：这一章不要写的内容

## 第2章 章名
摘要：……

也可使用：
**第1章：章名**
*   **章节摘要**：……
*   **章节目标**：……
*   **章节任务单**：
    1. ……
`;
