import type { APIKeyStatus, ImageSelectionSettings } from "@/api/settings";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export function isImageCapableProvider(item: APIKeyStatus): boolean {
  return Boolean(
    item.isConfigured
    && item.supportsImageGeneration
    && item.isActive !== false
    && (item.currentImageModel || item.imageModels.length > 0),
  );
}

export function listImageModelsForProvider(item: APIKeyStatus | undefined): string[] {
  if (!item) return [];
  const models = [...item.imageModels];
  if (item.currentImageModel && !models.includes(item.currentImageModel)) {
    models.unshift(item.currentImageModel);
  }
  return models;
}

export function resolveDefaultImageModel(
  item: APIKeyStatus | undefined,
  preferredModel?: string | null,
): string {
  const models = listImageModelsForProvider(item);
  if (preferredModel && models.includes(preferredModel)) {
    return preferredModel;
  }
  if (preferredModel?.trim()) {
    return preferredModel.trim();
  }
  return item?.currentImageModel || models[0] || "";
}

export interface PreferredImageSelection {
  provider: LLMProvider;
  model: string;
}

/**
 * 优先使用顶部/系统「默认图片模型」（image.currentSelection）；
 * 不可用时再回退到首个可出图供应商及其默认图像模型。
 */
export function resolvePreferredImageSelection(
  preferred: Pick<ImageSelectionSettings, "provider" | "model"> | null | undefined,
  providerConfigs: APIKeyStatus[],
): PreferredImageSelection | null {
  const capable = providerConfigs.filter(isImageCapableProvider);
  if (capable.length === 0) {
    return null;
  }

  const preferredProvider = preferred?.provider;
  const matched = preferredProvider
    ? capable.find((item) => item.provider === preferredProvider)
    : undefined;
  const selected = matched ?? capable[0];
  const model = resolveDefaultImageModel(
    selected,
    matched ? preferred?.model : undefined,
  );
  if (!model) {
    return null;
  }

  return {
    provider: selected.provider,
    model,
  };
}
