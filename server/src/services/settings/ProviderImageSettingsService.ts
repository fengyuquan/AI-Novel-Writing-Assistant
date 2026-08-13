import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";

export type ImageModelProvider = "openai" | "siliconflow" | "grok";

const IMAGE_MODEL_SETTING_PREFIX = "provider.imageModel";
const IMAGE_MODEL_CATALOG_PREFIX = "provider.imageModelCatalog";

const IMAGE_MODEL_OPTIONS: Record<ImageModelProvider, string[]> = {
  openai: ["gpt-image-2"],
  siliconflow: ["black-forest-labs/FLUX.1-schnell"],
  grok: ["grok-imagine-image"],
};

const IMAGE_MODEL_HINT_PATTERN = /image|img|flux|dall-?e|gpt-image|imagen|stable[-_]?diffusion|\bsd\b|sdxl|grok-imagine|midjourney|kolors|qwen[-_]?image|seedream|ideogram|recraft/i;

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function supportsImageModelSettings(provider: LLMProvider): boolean {
  return typeof provider === "string" && provider.trim().length > 0;
}

function isKnownImageModelProvider(provider: LLMProvider): provider is ImageModelProvider {
  return provider === "openai" || provider === "siliconflow" || provider === "grok";
}

export function getImageModelSettingKey(provider: LLMProvider): string | null {
  if (!supportsImageModelSettings(provider)) {
    return null;
  }
  return `${IMAGE_MODEL_SETTING_PREFIX}.${provider}`;
}

export function getImageModelOptions(provider: LLMProvider): string[] {
  if (!isKnownImageModelProvider(provider)) {
    return [];
  }
  return [...IMAGE_MODEL_OPTIONS[provider]];
}

export function getDefaultImageModel(provider: LLMProvider): string | undefined {
  return getImageModelOptions(provider)[0];
}

export function looksLikeImageModel(model: string): boolean {
  return IMAGE_MODEL_HINT_PATTERN.test(model.trim());
}

export function filterImageLikeModels(models: string[]): string[] {
  return Array.from(new Set(
    models
      .map((item) => item.trim())
      .filter((item) => item && looksLikeImageModel(item)),
  ));
}

export function mergeImageModelOptions(
  provider: LLMProvider,
  catalog: string[] = [],
  currentImageModel?: string | null,
): string[] {
  return Array.from(new Set([
    ...getImageModelOptions(provider),
    ...catalog,
    currentImageModel?.trim() || "",
  ].filter(Boolean)));
}

function getImageModelCatalogSettingKey(provider: LLMProvider): string | null {
  if (!supportsImageModelSettings(provider)) {
    return null;
  }
  return `${IMAGE_MODEL_CATALOG_PREFIX}.${provider}`;
}

export async function getCachedImageModelCatalog(provider: LLMProvider): Promise<string[]> {
  const key = getImageModelCatalogSettingKey(provider);
  if (!key) {
    return [];
  }
  try {
    const record = await prisma.appSetting.findUnique({ where: { key } });
    if (!record?.value?.trim()) {
      return [];
    }
    const parsed = JSON.parse(record.value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim());
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    return [];
  }
}

export async function getCachedImageModelCatalogMap(
  providers: LLMProvider[],
): Promise<Map<LLMProvider, string[]>> {
  const result = new Map<LLMProvider, string[]>();
  await Promise.all(providers.map(async (provider) => {
    result.set(provider, await getCachedImageModelCatalog(provider));
  }));
  return result;
}

export async function saveCachedImageModelCatalog(
  provider: LLMProvider,
  models: string[],
): Promise<string[]> {
  const key = getImageModelCatalogSettingKey(provider);
  if (!key) {
    return [];
  }
  const normalized = Array.from(new Set(
    models.map((item) => item.trim()).filter(Boolean),
  ));
  try {
    if (normalized.length === 0) {
      await prisma.appSetting.deleteMany({ where: { key } });
      return [];
    }
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(normalized) },
      create: { key, value: JSON.stringify(normalized) },
    });
    return normalized;
  } catch (error) {
    if (isMissingTableError(error)) {
      return normalized;
    }
    throw error;
  }
}

export async function resolveImageModelOptions(
  provider: LLMProvider,
  currentImageModel?: string | null,
): Promise<string[]> {
  const catalog = await getCachedImageModelCatalog(provider);
  return mergeImageModelOptions(provider, catalog, currentImageModel);
}

export function getProviderEnvImageModel(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return normalizeOptionalText(process.env.OPENAI_IMAGE_MODEL);
    case "siliconflow":
      return normalizeOptionalText(process.env.SILICONFLOW_IMAGE_MODEL);
    case "grok":
      return normalizeOptionalText(process.env.XAI_IMAGE_MODEL);
    default:
      return undefined;
  }
}

export async function getProviderImageModel(provider: LLMProvider): Promise<string | undefined> {
  if (!supportsImageModelSettings(provider)) {
    return undefined;
  }
  const key = getImageModelSettingKey(provider);
  if (!key) {
    return undefined;
  }

  try {
    const record = await prisma.appSetting.findUnique({
      where: { key },
    });
    return normalizeOptionalText(record?.value)
      ?? getProviderEnvImageModel(provider)
      ?? getDefaultImageModel(provider);
  } catch (error) {
    if (isMissingTableError(error)) {
      return getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider);
    }
    throw error;
  }
}

export async function getProviderImageModelMap(
  providers: LLMProvider[],
): Promise<Map<LLMProvider, string | undefined>> {
  const supportedProviders = Array.from(new Set(providers.filter((provider) => supportsImageModelSettings(provider))));
  const result = new Map<LLMProvider, string | undefined>();
  for (const provider of providers) {
    result.set(provider, getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider));
  }
  if (supportedProviders.length === 0) {
    return result;
  }

  const keys = supportedProviders
    .map((provider) => getImageModelSettingKey(provider))
    .filter((value): value is string => Boolean(value));

  try {
    const records = await prisma.appSetting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
    });
    const valueMap = new Map(records.map((item) => [item.key, normalizeOptionalText(item.value)]));
    for (const provider of supportedProviders) {
      const key = getImageModelSettingKey(provider);
      if (!key) {
        continue;
      }
      result.set(
        provider,
        valueMap.get(key)
          ?? getProviderEnvImageModel(provider)
          ?? getDefaultImageModel(provider),
      );
    }
    return result;
  } catch (error) {
    if (isMissingTableError(error)) {
      return result;
    }
    throw error;
  }
}

export async function saveProviderImageModel(
  provider: LLMProvider,
  imageModel: string | null | undefined,
): Promise<string | undefined> {
  if (!supportsImageModelSettings(provider)) {
    return undefined;
  }
  const key = getImageModelSettingKey(provider);
  if (!key) {
    return undefined;
  }

  const normalized = normalizeOptionalText(imageModel);

  try {
    if (!normalized) {
      await prisma.appSetting.deleteMany({
        where: { key },
      });
      return getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider);
    }

    await prisma.appSetting.upsert({
      where: { key },
      update: { value: normalized },
      create: { key, value: normalized },
    });
    return normalized;
  } catch (error) {
    if (isMissingTableError(error)) {
      return normalized ?? getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider);
    }
    throw error;
  }
}
