import type { ChapterEditorStyleBenchmarkCompareResponse } from "@ai-novel/shared/types/novel";

export function splitBenchmarkParagraphs(text: string): string[] {
  // 用精确的 `\n\n` 切段，才能保留中间空段（`a\n\n\n\nc` → ["a","","c"]）。
  // `\n\s*\n` / `\n{2,}` 会把连续空行吃掉，编辑时行号会跳。
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n");
  if (!normalized.trim()) {
    return [];
  }
  const parts = normalized.split("\n\n").map((item) => item.trim());
  while (parts.length > 0 && !parts[0]) {
    parts.shift();
  }
  while (parts.length > 0 && !parts[parts.length - 1]) {
    parts.pop();
  }
  return parts;
}

export function joinBenchmarkParagraphs(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

/** Map a user paragraph index onto a benchmark paragraph index by relative position. */
export function mapParagraphIndex(
  userIndex: number,
  userCount: number,
  benchmarkCount: number,
): number {
  if (benchmarkCount <= 0 || userIndex < 0) {
    return -1;
  }
  if (userCount <= 1 || benchmarkCount === 1) {
    return 0;
  }
  const ratio = userIndex / Math.max(1, userCount - 1);
  return Math.min(benchmarkCount - 1, Math.max(0, Math.round(ratio * (benchmarkCount - 1))));
}

export function findParagraphIndexByEvidence(paragraphs: string[], evidence: string): number {
  const needle = evidence.trim();
  if (!needle || paragraphs.length === 0) {
    return -1;
  }
  const exact = paragraphs.findIndex((paragraph) => paragraph.includes(needle));
  if (exact >= 0) {
    return exact;
  }
  const shortNeedle = needle.slice(0, Math.min(24, needle.length));
  if (shortNeedle.length < 4) {
    return -1;
  }
  return paragraphs.findIndex((paragraph) => paragraph.includes(shortNeedle));
}

/** Prefer AI compare alignment when available, otherwise fall back to relative index. */
export function resolveBenchmarkParagraphIndex(input: {
  userParagraphIndex: number;
  userParagraphs: string[];
  benchmarkParagraphs: string[];
  compareResult?: ChapterEditorStyleBenchmarkCompareResponse | null;
}): number {
  const {
    userParagraphIndex,
    userParagraphs,
    benchmarkParagraphs,
    compareResult,
  } = input;
  if (benchmarkParagraphs.length === 0 || userParagraphIndex < 0) {
    return -1;
  }

  const userParagraph = userParagraphs[userParagraphIndex] ?? "";
  if (compareResult?.segments?.length && userParagraph) {
    const matched = compareResult.segments.find((segment) => {
      const excerpt = segment.userExcerpt?.trim() ?? "";
      if (!excerpt) {
        return false;
      }
      return userParagraph.includes(excerpt) || excerpt.includes(userParagraph.slice(0, 20));
    });
    if (matched?.benchmarkExcerpt) {
      const byExcerpt = findParagraphIndexByEvidence(benchmarkParagraphs, matched.benchmarkExcerpt);
      if (byExcerpt >= 0) {
        return byExcerpt;
      }
    }
  }

  return mapParagraphIndex(userParagraphIndex, userParagraphs.length, benchmarkParagraphs.length);
}

export function updateParagraphAt(
  paragraphs: string[],
  index: number,
  nextText: string,
): string {
  if (index < 0) {
    return joinBenchmarkParagraphs(paragraphs);
  }
  const clone = paragraphs.slice();
  while (clone.length <= index) {
    clone.push("");
  }
  // 编辑中保留空段，避免逐字输入时段落错位；整段删空时用空字符串占位。
  // 注意：不要把连续空行折叠，否则中间空段会丢、行号会跳。
  clone[index] = nextText.replace(/\r\n/g, "\n");
  return clone.map((item) => item.trimEnd()).join("\n\n");
}

/** 在指定行插入空段，让当前及后续段落整体下移一行，用于对照错位时手动对齐。 */
export function insertBlankParagraphAt(paragraphs: string[], index: number): string {
  if (index < 0) {
    return joinBenchmarkParagraphs(paragraphs);
  }
  const clone = paragraphs.slice();
  while (clone.length < index) {
    clone.push("");
  }
  clone.splice(index, 0, "");
  return joinBenchmarkParagraphs(clone);
}

/** 减少一段换行：当前段并入上一段；若当前为空则只删掉空位，后续上移。 */
export function mergeParagraphWithPrevious(paragraphs: string[], index: number): string {
  if (index <= 0) {
    return joinBenchmarkParagraphs(paragraphs);
  }
  const clone = paragraphs.slice();
  while (clone.length <= index) {
    clone.push("");
  }
  const previous = clone[index - 1] ?? "";
  const current = clone[index] ?? "";
  if (!current) {
    clone.splice(index, 1);
  } else if (!previous) {
    clone[index - 1] = current;
    clone.splice(index, 1);
  } else {
    clone[index - 1] = `${previous}\n${current}`;
    clone.splice(index, 1);
  }
  return joinBenchmarkParagraphs(clone);
}

/** 按段落序号对齐对照：取左右（及多范文）中的最大段数。 */
export function resolveAlignedRowCount(counts: number[]): number {
  const max = counts.reduce((current, value) => Math.max(current, value), 0);
  return Math.max(1, max);
}

export function paragraphAt(paragraphs: string[], index: number): string {
  return paragraphs[index] ?? "";
}
