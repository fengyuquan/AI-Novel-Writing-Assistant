import type { ChapterEditorSelectionRange } from "../chapterEditorTypes";
import {
  countEditorWords,
  normalizeChapterContent,
  normalizeEditorText,
} from "../chapterEditorUtils";

export type WritingCheckpointKey = "open" | "mid" | "end";

export type WritingCheckpointStatus = {
  key: WritingCheckpointKey;
  label: string;
  hint: string;
  autoPass: boolean;
};

export const SELF_CHECK_ITEMS = [
  { id: "pov", label: "视角稳定，没有突然跳人" },
  { id: "advance", label: "信息或局势有推进，不是原地空转" },
  { id: "emotion", label: "情绪有变化，读者能感受到起伏" },
  { id: "hook", label: "章末留下钩子或明确下一步压力" },
  { id: "voice", label: "语气像本书，不像说明文或任务单" },
] as const;

export const STUCK_DIRECTIONS = [
  {
    id: "conflict",
    label: "推进冲突",
    instruction:
      "作者卡文了。请基于选中的章末上文只输出续写正文（不要重复选中段落原文），优先推进冲突或压力。约 80-150 字，读起来能直接接在原文后面。",
  },
  {
    id: "reaction",
    label: "补人物反应",
    instruction:
      "作者卡文了。请基于选中的章末上文只输出续写正文（不要重复选中段落原文），优先补主角或在场人物的具体反应与动作。约 80-150 字。",
  },
  {
    id: "transition",
    label: "转场推进",
    instruction:
      "作者卡文了。请基于选中的章末上文只输出续写正文（不要重复选中段落原文），用简洁转场推到下一场景入口并留钩子。约 80-150 字。",
  },
] as const;

export function getTailParagraphSelection(content: string): ChapterEditorSelectionRange | null {
  const normalized = normalizeEditorText(content);
  if (!normalized.trim()) {
    return null;
  }
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const last = paragraphs[paragraphs.length - 1];
  if (!last) {
    return null;
  }
  const from = normalized.lastIndexOf(last);
  if (from < 0) {
    return null;
  }
  return {
    from,
    to: from + last.length,
    text: last,
  };
}

const EVIDENCE_META_STOPWORDS = new Set([
  "中段", "开篇", "开头", "结尾", "章末", "正文", "段落", "连续", "两段", "一段", "几段",
  "解释", "说明", "处境", "现状", "信息", "重复", "推进", "新增", "没有", "但是", "之后",
  "很快", "出现", "问题", "证据", "建议", "需要", "应该", "可以", "这里", "那里", "这个",
  "那个", "一种", "一下", "什么", "怎么", "如果", "因为", "所以", "而且", "或者", "不是",
  "只是", "已经", "还是", "比较", "非常", "明显", "感觉", "读者", "作者", "主角", "配角",
]);

function cleanEvidenceNeedle(evidence: string): string {
  return evidence
    .replace(/^第\s*\d+\s*(?:行|段)[：:]\s*/u, "")
    .replace(/^证据[：:]\s*/u, "")
    .replace(/^摘录[：:]\s*/u, "")
    .trim();
}

function extractQuotedSnippets(text: string): string[] {
  const snippets: string[] = [];
  const patterns = [
    /「([^」]{4,80})」/gu,
    /“([^”]{4,80})”/gu,
    /『([^』]{4,80})』/gu,
    /"([^"]{4,80})"/gu,
    /'([^']{4,80})'/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const snippet = match[1]?.trim();
      if (snippet) {
        snippets.push(snippet);
      }
    }
  }
  return snippets;
}

function rangeAt(content: string, from: number, length: number): ChapterEditorSelectionRange | null {
  if (from < 0 || length <= 0 || from + length > content.length) {
    return null;
  }
  const text = content.slice(from, from + length);
  if (!text.trim()) {
    return null;
  }
  return { from, to: from + length, text };
}

function findExactOrPrefixMatch(content: string, needle: string): ChapterEditorSelectionRange | null {
  if (needle.length < 4) {
    return null;
  }
  const direct = content.indexOf(needle);
  if (direct >= 0) {
    return rangeAt(content, direct, needle.length);
  }
  // Prefer longer prefixes; avoid ultra-short false positives on descriptive meta text.
  for (const size of [48, 32, 24, 16]) {
    if (needle.length < size) {
      continue;
    }
    const prefix = needle.slice(0, size);
    const index = content.indexOf(prefix);
    if (index >= 0) {
      return rangeAt(content, index, prefix.length);
    }
  }
  return null;
}

function findBestSharedSubstring(content: string, needle: string, minLen = 8): ChapterEditorSelectionRange | null {
  const compactNeedle = needle.replace(/\s+/gu, "");
  if (compactNeedle.length < minLen) {
    return null;
  }
  const maxLen = Math.min(40, compactNeedle.length);
  for (let len = maxLen; len >= minLen; len -= 1) {
    for (let start = 0; start <= compactNeedle.length - len; start += 1) {
      const slice = compactNeedle.slice(start, start + len);
      if (/^[\p{P}\p{S}0-9]+$/u.test(slice)) {
        continue;
      }
      const index = content.indexOf(slice);
      if (index >= 0) {
        return rangeAt(content, index, slice.length);
      }
    }
  }
  return null;
}

function listParagraphRanges(content: string): Array<{ index: number; start: number; end: number; text: string }> {
  const parts = content.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  const ranges: Array<{ index: number; start: number; end: number; text: string }> = [];
  let cursor = 0;
  parts.forEach((text, index) => {
    const start = content.indexOf(text, cursor);
    if (start < 0) {
      return;
    }
    const end = start + text.length;
    ranges.push({ index, start, end, text });
    cursor = end;
  });
  return ranges;
}

function resolveRegionParagraphIndexes(query: string, paragraphCount: number): number[] | null {
  if (paragraphCount <= 0) {
    return null;
  }
  const numbered = query.match(/第\s*(\d+)\s*段/u);
  if (numbered?.[1]) {
    const index = Number(numbered[1]) - 1;
    if (Number.isFinite(index) && index >= 0 && index < paragraphCount) {
      return [index];
    }
  }
  if (/开篇|开头|章首|起头/u.test(query)) {
    return Array.from({ length: Math.max(1, Math.ceil(paragraphCount * 0.25)) }, (_, index) => index);
  }
  if (/结尾|章末|收束|末尾/u.test(query)) {
    const start = Math.max(0, Math.floor(paragraphCount * 0.75));
    return Array.from({ length: paragraphCount - start }, (_, index) => start + index);
  }
  if (/中段|中间|中部/u.test(query)) {
    const start = Math.max(0, Math.floor(paragraphCount * 0.3));
    const end = Math.min(paragraphCount - 1, Math.ceil(paragraphCount * 0.7));
    return Array.from({ length: Math.max(1, end - start + 1) }, (_, index) => start + index);
  }
  return null;
}

function extractAnchorTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/[\u4e00-\u9fff]{2,8}/gu)) {
    const token = match[0];
    if (!EVIDENCE_META_STOPWORDS.has(token)) {
      tokens.add(token);
    }
  }
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9_-]{2,}/g)) {
    tokens.add(match[0].toLowerCase());
  }
  return [...tokens];
}

function locateByParagraphScore(
  content: string,
  query: string,
): ChapterEditorSelectionRange | null {
  const paragraphs = listParagraphRanges(content);
  if (paragraphs.length === 0) {
    return null;
  }
  const tokens = extractAnchorTokens(query);
  const regionIndexes = resolveRegionParagraphIndexes(query, paragraphs.length);
  const regionSet = regionIndexes ? new Set(regionIndexes) : null;

  let best:
    | { score: number; paragraph: (typeof paragraphs)[number] }
    | null = null;

  for (const paragraph of paragraphs) {
    let score = 0;
    for (const token of tokens) {
      if (paragraph.text.includes(token)) {
        score += Math.min(token.length, 6);
      }
    }
    if (regionSet?.has(paragraph.index)) {
      score += tokens.length > 0 ? 4 : 2;
    }
    if (!best || score > best.score) {
      best = { score, paragraph };
    }
  }

  const minScore = tokens.length > 0 ? Math.max(8, Math.min(14, tokens.length * 3)) : 2;
  if (!best || best.score < minScore) {
    if (regionSet && regionSet.size > 0) {
      const first = paragraphs.find((item) => regionSet.has(item.index));
      if (first) {
        return rangeAt(content, first.start, first.text.length);
      }
    }
    return null;
  }

  return rangeAt(content, best.paragraph.start, best.paragraph.text.length);
}

/**
 * Locate audit/review evidence inside chapter content.
 * Evidence may be a verbatim quote or a descriptive note; prefer exact/quote matches,
 * then shared substrings, then paragraph-level region + keyword scoring.
 */
export function locateEvidenceInContent(
  content: string,
  evidence: string,
  extraHint = "",
): ChapterEditorSelectionRange | null {
  const normalized = normalizeChapterContent(content);
  if (!normalized.trim()) {
    return null;
  }

  const needle = cleanEvidenceNeedle(evidence);
  const hint = extraHint.trim();
  const query = [needle, hint].filter(Boolean).join("\n");
  if (!query) {
    return null;
  }

  const quoteCandidates = [
    ...extractQuotedSnippets(query),
    ...(needle.includes("；") ? [needle.split("；")[0]?.trim() ?? ""] : []),
    ...(needle.includes(";") ? [needle.split(";")[0]?.trim() ?? ""] : []),
    needle,
  ].filter((item) => item.length >= 4);

  for (const candidate of quoteCandidates) {
    const matched = findExactOrPrefixMatch(normalized, candidate)
      ?? findBestSharedSubstring(normalized, candidate, candidate.length >= 16 ? 10 : 8);
    if (matched) {
      return matched;
    }
  }

  return locateByParagraphScore(normalized, query);
}

export function buildWritingCheckpoints(content: string): WritingCheckpointStatus[] {
  const normalized = normalizeEditorText(content).trim();
  const words = countEditorWords(normalized);
  const paragraphs = normalized ? normalized.split(/\n{2,}/).filter((item) => item.trim()) : [];
  const head = normalized.slice(0, Math.min(280, normalized.length));
  const tail = normalized.slice(Math.max(0, normalized.length - 280));
  const hasHookSignal = /[？?！!…]|却|忽然|突然|没想到|下一秒|难道|要是|如果|只要|必须|不能|来不及/.test(head);
  const hasMidPressure = paragraphs.length >= 3 && words >= 600;
  const hasEndingHook = /[？?]|下章|明天|今晚|门外|身后|消息|来电|杀|逃|真相|秘密|倒计时|只剩/.test(tail)
    || /[！!]{1,2}$/.test(tail.trim());

  return [
    {
      key: "open",
      label: "开篇钩子",
      hint: "前两段是否尽快进入压力、异常或冲突？",
      autoPass: words >= 120 && hasHookSignal,
    },
    {
      key: "mid",
      label: "中段推进",
      hint: "中段是否持续推进局势，而不只是说明？",
      autoPass: hasMidPressure,
    },
    {
      key: "end",
      label: "结尾钩子",
      hint: "章末是否留下下一步压力或疑问？",
      autoPass: words >= 400 && hasEndingHook,
    },
  ];
}

export function buildTaskBulletHints(taskSheet?: string | null): string[] {
  if (!taskSheet?.trim()) {
    return [];
  }
  return taskSheet
    .split(/\n+/u)
    .map((line) => line.replace(/^\s*(?:\d+[\.\)、]|[-*•])\s*/u, "").trim())
    .filter((line) => line.length >= 4)
    .slice(0, 6);
}

export type AwkwardHint = {
  id: string;
  message: string;
  excerpt: string;
  fixSuggestion: string;
};

/** Lightweight, deterministic writing hints for the editor (not a full audit). */
export function detectAwkwardWritingHints(content: string): AwkwardHint[] {
  const normalized = normalizeEditorText(content);
  if (!normalized.trim()) {
    return [];
  }
  const hints: AwkwardHint[] = [];
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);

  paragraphs.forEach((paragraph, index) => {
    if (paragraph.length >= 220) {
      hints.push({
        id: `long-${index}`,
        message: "这段偏长，阅读时容易一口气喘不过来。",
        excerpt: paragraph.slice(0, 48),
        fixSuggestion: "拆成两三段，或删掉重复描写。",
      });
    }
    if (/——|……|\.{3,}/u.test(paragraph)) {
      hints.push({
        id: `dash-${index}`,
        message: "破折号/省略号偏多，可能显得拖沓。",
        excerpt: paragraph.slice(0, 40),
        fixSuggestion: "能删就删，改成更干脆的动作或对话。",
      });
    }
    if (/(非常|十分|极其|特别|微微|轻轻|缓缓).{0,12}(非常|十分|极其|特别|微微|轻轻|缓缓)/u.test(paragraph)) {
      hints.push({
        id: `adv-${index}`,
        message: "程度副词堆叠，语气容易发虚。",
        excerpt: paragraph.slice(0, 40),
        fixSuggestion: "换成具体动作或细节，少用“非常/微微”。",
      });
    }
  });

  for (let index = 1; index < paragraphs.length; index += 1) {
    const prev = paragraphs[index - 1] ?? "";
    const current = paragraphs[index] ?? "";
    if (prev.length >= 12 && prev === current) {
      hints.push({
        id: `repeat-${index}`,
        message: "相邻段落几乎完全重复。",
        excerpt: current.slice(0, 40),
        fixSuggestion: "删掉一段，或改成新的推进信息。",
      });
    }
  }

  return hints.slice(0, 6);
}
