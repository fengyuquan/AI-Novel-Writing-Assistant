import type { APIKeyStatus } from "@/api/settings";

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
