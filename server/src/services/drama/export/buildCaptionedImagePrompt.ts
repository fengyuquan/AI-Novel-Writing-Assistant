/**
 * Deterministic post-processing: turn structured visualPrompt + dialogue
 * into an image prompt that asks the image model to burn dialogue into the frame.
 * No keyword routing — only structured field assembly.
 */

export function buildCaptionedImagePrompt(input: {
  visualPrompt?: string | null;
  dialogue?: string | null;
}): string {
  const visual = typeof input.visualPrompt === "string" ? input.visualPrompt.trim() : "";
  const dialogue = typeof input.dialogue === "string" ? input.dialogue.trim() : "";
  const scene = visual || "竖屏 9:16 短剧分镜静帧，电影感构图，人物表情与动作清晰。";

  if (!dialogue) {
    return [
      scene,
      "",
      "【画面内文字】本镜不要添加任何文字：不要字幕、不要对白框、不要旁白、不要画外音、不要叙述句。",
      "画幅：9:16 竖屏。",
    ].join("\n");
  }

  return [
    scene,
    "",
    "【画面内文字｜仅短对白】请把下面「角色说出口的短对白」原文画进图片：",
    dialogue,
    "要求：中文大字、清晰可读，放在竖屏底部安全区；不要紧贴边缘；不要遮挡人物面部。",
    "禁止：旁白、画外音、叙述句、场景说明、内心长独白、作者解说。只能出现上述短对白。",
    "文字必须是画面的一部分，不要另做外挂字幕层。画幅：9:16 竖屏。",
  ].join("\n");
}

export const CAPTIONED_IMAGE_USAGE_HINT = [
  "按集与镜头顺序，只用每镜的 captionedImagePrompt 交给出图 AI（如豆包）生成 9:16 竖屏图。",
  "模型应把「短对白」画进图里，不要画旁白/叙述；并严格保持角色外形锁定。",
  "按同一顺序保存图片即可；后续如何拼接由你自己决定。",
].join(" ");

export const SLIDESHOW_USAGE_HINT =
  "按集与镜头顺序，用 visualPrompt 生成竖屏图片，用 dialogue 作为短对白（不要用旁白）。";
