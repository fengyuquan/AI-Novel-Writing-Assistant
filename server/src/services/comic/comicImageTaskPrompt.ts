/**
 * 漫画图像任务特征声明
 *
 * 无参考图时：在 prompt 前声明纯文生图，避免依赖 /images/edits。
 * 有参考图时：不注入该声明（由调用方 strip），避免干扰图生图/外部工具。
 */

export type ComicImageTaskKind =
  | "panel"
  | "character_sheet"
  | "character_expression"
  | "character_asset"
  | "scene_sheet";

const TASK_KIND_LABEL: Record<ComicImageTaskKind, string> = {
  panel: "竖版漫画单格成图",
  character_sheet: "角色三视图/设计稿成图",
  character_expression: "角色表情稿成图",
  character_asset: "角色资产设定图成图",
  scene_sheet: "场景设定图成图",
};

/** 便于前后端按块剥离/注入，不依赖整段文案完全一致 */
export const COMIC_TEXT_TO_IMAGE_LEAD_START = "【文生图任务声明】";
export const COMIC_TEXT_TO_IMAGE_LEAD_END = "【/文生图任务声明】";

/**
 * 拼在漫画生图 prompt 最前：声明任务类型与文生图约束。
 * 仅在「本次不发送参考图」时使用。
 */
export function buildComicTextToImageTaskLead(kind: ComicImageTaskKind): string {
  const label = TASK_KIND_LABEL[kind];
  const body = [
    `任务类型：纯文生图（text-to-image）· ${label}`,
    "本请求只走图像生成接口，不使用图生图/图像编辑（images/edits）能力",
    "所有角色外貌、服装、表情、场景色调、材质、构图与镜头约束都必须仅凭下方文字完整执行",
    "即使没有参考图输入，也必须按文字锁定的身份与场景特征稳定出图，禁止换成通用模板脸或无关场景",
    `task: text-to-image only for ${kind.replace(/_/g, " ")}; do not rely on image-to-image or /images/edits; fulfill every visual constraint from the written prompt alone`,
  ].join(". ");
  return `${COMIC_TEXT_TO_IMAGE_LEAD_START}\n${body}\n${COMIC_TEXT_TO_IMAGE_LEAD_END}`;
}

/** 去掉文生图任务声明块（有附加参考图时使用） */
export function stripComicTextToImageTaskLead(prompt: string): string {
  const text = prompt ?? "";
  const start = text.indexOf(COMIC_TEXT_TO_IMAGE_LEAD_START);
  if (start < 0) {
    // 兼容旧版无标记、以「任务类型：纯文生图」开头的拼接
    const legacyFull = text.match(
      /^任务类型：纯文生图[\s\S]*?fulfill every visual constraint from the written prompt alone\.?\s*/i,
    );
    if (legacyFull) return text.slice(legacyFull[0].length).replace(/^\.\s*/, "").trim();
    return text.trim();
  }
  const end = text.indexOf(COMIC_TEXT_TO_IMAGE_LEAD_END, start);
  if (end < 0) return text.trim();
  const before = text.slice(0, start);
  const after = text.slice(end + COMIC_TEXT_TO_IMAGE_LEAD_END.length);
  return `${before}${after}`.replace(/^\s*\.\s*/, "").trim();
}

/** 无参考图时确保声明存在；有参考图时确保声明不存在 */
export function applyComicTextToImageTaskLead(
  prompt: string,
  kind: ComicImageTaskKind,
  hasReferenceImages: boolean,
): string {
  const stripped = stripComicTextToImageTaskLead(prompt);
  if (hasReferenceImages) return stripped;
  if (stripped.startsWith(COMIC_TEXT_TO_IMAGE_LEAD_START)) return stripped;
  const lead = buildComicTextToImageTaskLead(kind);
  return `${lead}\n\n${stripped}`.trim();
}

export function resolveComicImageTaskKind(kind: string | undefined | null): ComicImageTaskKind {
  const raw = (kind ?? "").trim();
  const key = raw.includes(":") ? raw.split(":")[0]! : raw;
  if (key === "character_sheet" || key.includes("character.sheet")) return "character_sheet";
  if (key === "character_expression" || key.includes("character.expression")) return "character_expression";
  if (key === "character_asset" || key.includes("character-asset") || key === "asset") return "character_asset";
  if (key === "scene_sheet" || key.includes("comic.scene") || key === "scene") return "scene_sheet";
  if (key === "panel" || key.includes("comic.panel")) return "panel";
  if (key === "character") return "character_sheet";
  return "panel";
}
