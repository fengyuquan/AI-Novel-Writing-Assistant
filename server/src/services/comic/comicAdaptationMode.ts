/**
 * 漫画项目 stylePreset JSON 中的改编模式读写。
 * adaptationMode 存在 stylePreset 内，避免新增 DB 字段。
 */
export type ComicAdaptationMode = "faithful" | "creative";

export interface ComicStylePresetData {
  style?: string;
  format?: string;
  promptKeywords?: string;
  imageSize?: string;
  negativeStyle?: string;
  adaptationMode?: ComicAdaptationMode;
  [key: string]: unknown;
}

export function parseComicStylePreset(raw: string | null | undefined): ComicStylePresetData {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as ComicStylePresetData;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveComicAdaptationMode(
  stylePresetRaw: string | null | undefined,
  sourceType?: string,
): ComicAdaptationMode {
  const preset = parseComicStylePreset(stylePresetRaw);
  if (preset.adaptationMode === "faithful" || preset.adaptationMode === "creative") {
    return preset.adaptationMode;
  }
  // 文本导入默认保真（新闻/报道场景）；其余默认创意
  return sourceType === "text_import" ? "faithful" : "creative";
}

export function withComicAdaptationMode(
  stylePresetRaw: string | null | undefined,
  adaptationMode: ComicAdaptationMode,
): string {
  const preset = parseComicStylePreset(stylePresetRaw);
  return JSON.stringify({ ...preset, adaptationMode });
}
