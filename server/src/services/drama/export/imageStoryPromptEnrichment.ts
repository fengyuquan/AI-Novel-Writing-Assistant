/**
 * Deterministic enrichment for image-story prompts:
 * - lock character appearance into visual prompts
 * - keep only short spoken dialogue for on-image text
 */

export interface CharacterVisualRef {
  name: string;
  visualAnchor?: string | null;
}

const NARRATION_LINE_PREFIX =
  /^(旁白|画外音|叙述|解说|内心独白|独白|OS|NARRATOR|Narrator)\s*[:：\-—]/i;

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

/** Drop narration/旁白 lines; keep short spoken dialogue only. */
export function sanitizeSpokenDialogue(dialogue?: string | null): string | null {
  if (typeof dialogue !== "string") {
    return null;
  }
  const lines = dialogue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !NARRATION_LINE_PREFIX.test(line));

  if (lines.length === 0) {
    return null;
  }

  // Prefer 1-2 short spoken lines for on-image text.
  const compact = lines.slice(0, 2).join("\n").trim();
  if (!compact) {
    return null;
  }
  if (compact.length > 60) {
    return `${compact.slice(0, 60).trim()}…`;
  }
  return compact;
}

export function appendCharacterVisualLocks(
  visualPrompt: string,
  characterRefs: string[] | null | undefined,
  characters: CharacterVisualRef[],
): string {
  const base = visualPrompt.trim();
  const refs = (characterRefs ?? []).map((name) => name.trim()).filter(Boolean);
  if (refs.length === 0 || characters.length === 0) {
    return base;
  }

  const byName = new Map(
    characters
      .filter((item) => item.name.trim())
      .map((item) => [normalizeName(item.name), item] as const),
  );

  const locks: string[] = [];
  for (const ref of refs) {
    const matched = byName.get(normalizeName(ref));
    const anchor = matched?.visualAnchor?.trim();
    if (anchor) {
      locks.push(`${matched!.name}必须严格保持同一外形：${anchor}`);
    } else {
      locks.push(`${ref}必须与前后镜头同一人物外形，禁止换脸换发型换服装`);
    }
  }

  if (locks.length === 0) {
    return base;
  }

  return [
    base,
    "",
    "【角色外形锁定｜跨镜必须一致】",
    ...locks,
    "同一角色在不同镜头中禁止改变年龄、脸型、发型、服装主色与标志性特征。",
  ].join("\n");
}
