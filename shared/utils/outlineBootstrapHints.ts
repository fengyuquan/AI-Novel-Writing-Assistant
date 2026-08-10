/**
 * Deterministic outline preamble extraction for create-from-outline bootstrap.
 * These hints feed the AI prompt and fill fields left empty after structured AI output.
 * They do not invent plot; they only lift already-written labeled sections / titles.
 */

export type OutlineBootstrapHints = {
  title: string | null;
  descriptionSeed: string | null;
  worldSourceText: string | null;
  first30ChapterPromise: string | null;
  characterNameHints: string[];
};

const BOOK_TITLE_HEADING_RE = /^(?:#{1,3}|＃{1,3})\s*[《「]([^》」]{1,80})[》」]/u;
const BOOK_TITLE_INLINE_RE = /[《「]([^》」]{2,80})[》」]/u;
const WORLD_HEADING_RE = /^(?:#{1,6}|＃{1,6})\s*.*(世界观|世界设定|核心机制|力量体系|世界规则)/u;
const FIRST30_HEADING_RE = /^(?:#{1,6}|＃{1,6})\s*.*(前\s*30\s*章|前三十章|核心承诺|开局承诺)/u;
const ANY_HEADING_RE = /^(?:#{1,6}|＃{1,6})\s+\S/u;
/** `主角**楚天**` / `**楚天**（主角）` — require markdown emphasis around the name. */
const PROTAGONIST_MARKED_NAME_RE = /主角\*{1,2}\s*([^*\n【】\[\]「」]{1,12}?)\s*\*{1,2}/gu;
const MARKED_PROTAGONIST_LABEL_RE = /\*{1,2}\s*([^*\n【】\[\]「」]{1,12}?)\s*\*{1,2}\s*[（(]\s*主角\s*[）)]/gu;

function trimBlock(value: string, maxChars: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trimEnd()}\n…(截断)`;
}

function extractSection(
  lines: string[],
  startPredicate: (line: string) => boolean,
  maxChars: number,
): string | null {
  const startIndex = lines.findIndex((line) => startPredicate(line.trim()));
  if (startIndex < 0) {
    return null;
  }
  const body: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed && ANY_HEADING_RE.test(trimmed) && !startPredicate(trimmed)) {
      break;
    }
    body.push(line);
  }
  const text = trimBlock(body.join("\n"), maxChars);
  return text.length > 0 ? text : null;
}

function extractTitle(lines: string[], fullText: string): string | null {
  for (const raw of lines.slice(0, 40)) {
    const line = raw.trim();
    const heading = line.match(BOOK_TITLE_HEADING_RE);
    if (heading?.[1]?.trim()) {
      return heading[1].trim();
    }
  }
  const head = fullText.slice(0, 2_500);
  const matches = [...head.matchAll(new RegExp(BOOK_TITLE_INLINE_RE.source, "gu"))]
    .map((item) => item[1]?.trim())
    .filter((item): item is string => Boolean(item && item.length >= 2));
  if (matches.length === 0) {
    return null;
  }
  // Prefer the most frequent title mention in the preamble.
  const counts = new Map<string, number>();
  for (const title of matches) {
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? null;
}

function extractDescriptionSeed(lines: string[]): string | null {
  for (const raw of lines.slice(0, 30)) {
    const line = raw.trim();
    if (!line || ANY_HEADING_RE.test(line) || line === "---") {
      continue;
    }
    if (line.length < 20) {
      continue;
    }
    return trimBlock(line.replace(/^这是一份[^。]*。/, "").trim() || line, 800);
  }
  return null;
}

function isPlausibleCharacterName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 12) {
    return false;
  }
  if (/[，,。；;：:、！!？?（）()《》<>"“”‘’]/.test(name)) {
    return false;
  }
  // Reject sentence fragments that slipped past the marker regex.
  if (/^(的|了|是|在|与|和|被|把|从|到|为|对)/.test(name) || /(的|了|是)$/.test(name)) {
    return false;
  }
  return true;
}

function extractCharacterNameHints(fullText: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const pushName = (raw: string | undefined) => {
    const name = (raw ?? "").replace(/[*＊]/g, "").trim();
    if (!isPlausibleCharacterName(name) || seen.has(name)) {
      return;
    }
    seen.add(name);
    names.push(name);
  };
  for (const match of fullText.matchAll(PROTAGONIST_MARKED_NAME_RE)) {
    pushName(match[1]);
    if (names.length >= 8) {
      return names;
    }
  }
  for (const match of fullText.matchAll(MARKED_PROTAGONIST_LABEL_RE)) {
    pushName(match[1]);
    if (names.length >= 8) {
      return names;
    }
  }
  return names;
}

export function extractOutlineBootstrapHints(text: string): OutlineBootstrapHints {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return {
      title: null,
      descriptionSeed: null,
      worldSourceText: null,
      first30ChapterPromise: null,
      characterNameHints: [],
    };
  }
  const lines = normalized.split("\n");
  return {
    title: extractTitle(lines, normalized),
    descriptionSeed: extractDescriptionSeed(lines),
    worldSourceText: extractSection(lines, (line) => WORLD_HEADING_RE.test(line), 6_000),
    first30ChapterPromise: extractSection(lines, (line) => FIRST30_HEADING_RE.test(line), 1_200),
    characterNameHints: extractCharacterNameHints(normalized.slice(0, 8_000)),
  };
}
