import type {
  ChapterEditorStyleBenchmarkEssenceCard,
  ChapterEditorStyleBenchmarkEssenceCompliance,
  ChapterEditorStyleBenchmarkReference,
} from "@ai-novel/shared/types/novel";
import { countEditorWords, normalizeChapterContent } from "./chapterEditorShared";

export const STYLE_BENCHMARK_SAMPLE_EXCERPT_CHARS = 1200;
export const STYLE_BENCHMARK_MAX_SAMPLE_EXCERPTS = 3;
export const STYLE_BENCHMARK_SEGMENT_THRESHOLD = 4000;
export const STYLE_BENCHMARK_SEGMENT_TARGET_CHARS = 1800;
export const STYLE_BENCHMARK_MAX_SEGMENTS = 8;

export function styleBenchmarkReferenceKey(reference: ChapterEditorStyleBenchmarkReference): string {
  return `${reference.kind}:${reference.id}`;
}

export function clipStyleBenchmarkSample(text: string, maxChars = STYLE_BENCHMARK_SAMPLE_EXCERPT_CHARS): string {
  const normalized = normalizeChapterContent(text);
  if (!normalized) {
    return "";
  }
  if (normalized.replace(/\s+/g, "").length <= maxChars) {
    return normalized;
  }
  let count = 0;
  let end = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    if (!/\s/.test(normalized[i]!)) {
      count += 1;
    }
    end = i + 1;
    if (count >= maxChars) {
      break;
    }
  }
  return `${normalized.slice(0, end).trim()}…`;
}

function dialogueDensityScore(text: string): number {
  const quotes = (text.match(/[“”「」『』"]/g) ?? []).length;
  const dialogueMarks = (text.match(/说|道|问|答|喊|低声|冷冷/g) ?? []).length;
  return quotes * 2 + dialogueMarks;
}

function pickDenseWindow(text: string, maxChars: number): string {
  const normalized = normalizeChapterContent(text);
  if (!normalized) {
    return "";
  }
  if (countEditorWords(normalized) <= maxChars) {
    return normalized;
  }
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return clipStyleBenchmarkSample(normalized, maxChars);
  }
  let bestStart = 0;
  let bestScore = -1;
  for (let start = 0; start < paragraphs.length; start += 1) {
    let chars = 0;
    let score = 0;
    let end = start;
    while (end < paragraphs.length && chars < maxChars) {
      const piece = paragraphs[end]!;
      chars += countEditorWords(piece);
      score += dialogueDensityScore(piece);
      end += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  const packed: string[] = [];
  let packedChars = 0;
  for (let i = bestStart; i < paragraphs.length; i += 1) {
    const piece = paragraphs[i]!;
    const next = packedChars + countEditorWords(piece);
    if (packed.length > 0 && next > maxChars) {
      break;
    }
    packed.push(piece);
    packedChars = next;
    if (packedChars >= maxChars) {
      break;
    }
  }
  return clipStyleBenchmarkSample(packed.join("\n\n"), maxChars);
}

export function pickStyleBenchmarkChapterSamples(contents: Array<string | null | undefined>): string {
  const cleaned = contents.map((item) => normalizeChapterContent(item ?? "")).filter(Boolean);
  if (cleaned.length === 0) {
    return "";
  }
  const windows: string[] = [];
  const first = cleaned[0]!;
  windows.push(clipStyleBenchmarkSample(first));
  if (cleaned.length === 1) {
    const mid = pickDenseWindow(first, STYLE_BENCHMARK_SAMPLE_EXCERPT_CHARS);
    if (mid && mid !== windows[0]) {
      windows.push(mid);
    }
  } else {
    const midSource = cleaned[Math.floor(cleaned.length / 2)]!;
    windows.push(pickDenseWindow(midSource, STYLE_BENCHMARK_SAMPLE_EXCERPT_CHARS));
    const last = cleaned[cleaned.length - 1]!;
    if (last !== first && last !== midSource) {
      windows.push(pickDenseWindow(last, STYLE_BENCHMARK_SAMPLE_EXCERPT_CHARS));
    }
  }
  return windows
    .filter(Boolean)
    .slice(0, STYLE_BENCHMARK_MAX_SAMPLE_EXCERPTS)
    .map((sample, index) => `【样章 ${index + 1}】\n${sample}`)
    .join("\n\n");
}

export function splitStyleBenchmarkRewriteSegments(userContent: string): string[] {
  const normalized = normalizeChapterContent(userContent);
  if (!normalized) {
    return [];
  }
  if (countEditorWords(normalized) <= STYLE_BENCHMARK_SEGMENT_THRESHOLD) {
    return [normalized];
  }
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return [normalized];
  }
  const segments: string[] = [];
  let bucket: string[] = [];
  let bucketChars = 0;
  for (const paragraph of paragraphs) {
    const paragraphChars = countEditorWords(paragraph);
    const nextChars = bucketChars + paragraphChars;
    if (
      bucket.length > 0
      && nextChars > STYLE_BENCHMARK_SEGMENT_TARGET_CHARS
      && segments.length < STYLE_BENCHMARK_MAX_SEGMENTS - 1
    ) {
      segments.push(bucket.join("\n\n"));
      bucket = [paragraph];
      bucketChars = paragraphChars;
      continue;
    }
    bucket.push(paragraph);
    bucketChars = nextChars;
  }
  if (bucket.length > 0) {
    segments.push(bucket.join("\n\n"));
  }
  return segments.slice(0, STYLE_BENCHMARK_MAX_SEGMENTS);
}

export function isStyleBenchmarkEssenceCard(value: unknown): value is ChapterEditorStyleBenchmarkEssenceCard {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.fingerprintLines)
    && Array.isArray(record.voiceRules)
    && Array.isArray(record.dialogueRules)
    && Array.isArray(record.pacingRules)
    && Array.isArray(record.sensoryRules)
    && Array.isArray(record.sampleAnchors)
    && (record.confidence === "high" || record.confidence === "medium" || record.confidence === "low");
}

export function normalizeEssenceCompliance(
  value: ChapterEditorStyleBenchmarkEssenceCompliance | null | undefined,
  fingerprintLines: string[],
): ChapterEditorStyleBenchmarkEssenceCompliance {
  const covered = (value?.covered ?? []).map((item) => item.trim()).filter(Boolean);
  const missedFromModel = (value?.missed ?? []).map((item) => item.trim()).filter(Boolean);
  const missed = missedFromModel.length > 0
    ? missedFromModel
    : fingerprintLines.filter((line) => !covered.some((item) => item.includes(line) || line.includes(item)));
  return {
    covered,
    missed,
    notes: value?.notes?.trim() || (missed.length > 0 ? "部分精髓指纹尚未覆盖，可按缺口再生成。" : "精髓指纹基本覆盖。"),
  };
}

export function formatEssenceCardJson(essence: ChapterEditorStyleBenchmarkEssenceCard): string {
  return JSON.stringify(essence, null, 2);
}
