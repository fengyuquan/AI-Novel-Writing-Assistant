/**
 * Clipboard text for chapter image-story packs (Doubao-oriented).
 */

export function buildChapterImageStoryCopyText(jsonBody: string): string {
  const preamble = [
    "请按下面 JSON 提示词包，根据这一章剧情按顺序生成竖屏图片。",
    "",
    "规则：",
    "1. 只按 shots 的 order 处理，不要打乱、不要跳过。",
    "2. 画幅固定 9:16 竖屏。",
    "3. 每一镜只用该镜的 captionedImagePrompt 出图。",
    "4. 人物必须严格按提示词里的「角色外形锁定」保持一致，禁止换脸换发型换服装。",
    "5. 画面内文字只允许短对白；不要画旁白、画外音、叙述句。",
    "6. 不要再额外叠一层字幕。",
    "7. 如果某镜 captionedImagePrompt / visualPrompt 为空，或 warnings 提到该镜，先告诉我，再问是否跳过。",
    "8. 从镜头 1 开始；每次只出一张，等我说「继续」再下一张。",
    "",
    "开始前先回复：共几镜、是否有 warnings，然后立刻生成第 1 镜。",
    "",
    "下面是完整 JSON：",
  ].join("\n");
  return `${preamble}\n\n${jsonBody.trim()}\n`;
}

export function chapterImageStoryCopyFilename(chapterOrder: number, chapterTitle?: string | null): string {
  const safeTitle = (chapterTitle?.trim() || `第${chapterOrder}章`).replace(/[\\/:*?"<>|]/g, "_");
  return `${safeTitle}-切图提示词.txt`;
}
