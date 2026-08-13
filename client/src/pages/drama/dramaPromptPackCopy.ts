/**
 * Build clipboard text for external image AIs (e.g. 豆包):
 * opening instructions + full prompt-pack JSON.
 */

export type DramaPromptPackCopyFormat = "prompt-pack" | "prompt-pack-captioned";

const SLIDESHOW_DOUBAO_PREAMBLE = [
  "请按下面 JSON 提示词包，帮我按顺序生成竖屏短剧切图。",
  "",
  "规则：",
  "1. 只按 episodes → shots 的 order 处理，不要打乱、不要跳过。",
  "2. 画幅固定 9:16 竖屏。",
  "3. 每一镜用该镜的 visualPrompt 作为出图主提示词。",
  "4. 角色外观尽量对照 JSON 顶部 characters 的 visualAnchor，保持前后一致。",
  "5. 每生成一镜后，同时给出该镜的 dialogue 作为台词/字幕文案（没有就写「无台词」）。",
  "6. 如果某镜 visualPrompt 为空，或 warnings 提到该镜，先告诉我，再问是否跳过。",
  "7. 先从第 1 集镜头 1 开始；每次只出一张，等我说「继续」再下一张。",
  "",
  "开始前先回复：总共几集、每集几镜、是否有 warnings，然后立刻生成第 1 集第 1 镜。",
  "",
  "下面是完整 JSON：",
].join("\n");

const CAPTIONED_DOUBAO_PREAMBLE = [
  "请按下面 JSON 提示词包，帮我按顺序生成竖屏短剧图片。",
  "",
  "规则：",
  "1. 只按 episodes → shots 的 order 处理，不要打乱、不要跳过。",
  "2. 画幅固定 9:16 竖屏。",
  "3. 每一镜只用该镜的 captionedImagePrompt 出图。",
  "4. 人物必须严格按提示词里的「角色外形锁定」保持一致，禁止换脸换发型换服装。",
  "5. 画面内文字只允许短对白；不要画旁白、画外音、叙述句。",
  "6. 不要再额外叠一层字幕。",
  "7. 如果某镜 captionedImagePrompt / visualPrompt 为空，或 warnings 提到该镜，先告诉我，再问是否跳过。",
  "8. 先从第 1 集镜头 1 开始；每次只出一张，等我说「继续」再下一张。",
  "",
  "开始前先回复：总共几集、每集几镜、是否有 warnings，然后立刻生成第 1 集第 1 镜。",
  "",
  "下面是完整 JSON：",
].join("\n");

export function buildPromptPackCopyText(
  format: DramaPromptPackCopyFormat,
  jsonBody: string,
): string {
  const preamble = format === "prompt-pack-captioned"
    ? CAPTIONED_DOUBAO_PREAMBLE
    : SLIDESHOW_DOUBAO_PREAMBLE;
  return `${preamble}\n\n${jsonBody.trim()}\n`;
}

export function promptPackCopyFilename(
  format: DramaPromptPackCopyFormat,
  projectTitle?: string,
): string {
  const base = (projectTitle?.trim() || "prompt-pack").replace(/[\\/:*?"<>|]/g, "_");
  return format === "prompt-pack-captioned"
    ? `${base}-对话入画.txt`
    : `${base}-切图包.txt`;
}
