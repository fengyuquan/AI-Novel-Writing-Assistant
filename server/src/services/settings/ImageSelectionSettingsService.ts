import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { getProviderImageModel } from "./ProviderImageSettingsService";

const IMAGE_SELECTION_SETTING_KEY = "image.currentSelection";

export interface ImageSelectionSettings {
  provider: LLMProvider;
  model: string;
}

function normalizeProvider(value: unknown): LLMProvider | null {
  return typeof value === "string" && value.trim() ? (value.trim() as LLMProvider) : null;
}

function normalizeModel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSelectionPayload(value: string): { provider: LLMProvider; model: string | null } | null {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    const provider = normalizeProvider(payload.provider);
    if (!provider) {
      return null;
    }
    return {
      provider,
      model: normalizeModel(payload.model),
    };
  } catch {
    return null;
  }
}

function serializeSelection(input: ImageSelectionSettings): string {
  return JSON.stringify({
    provider: input.provider,
    model: input.model,
  });
}

async function hydrateSelection(
  provider: LLMProvider,
  model: string | null,
): Promise<ImageSelectionSettings | null> {
  const resolvedModel = model ?? (await getProviderImageModel(provider)) ?? null;
  if (!resolvedModel) {
    return null;
  }
  return { provider, model: resolvedModel };
}

export async function getImageSelectionSettings(): Promise<ImageSelectionSettings | null> {
  const record = await prisma.appSetting.findUnique({
    where: { key: IMAGE_SELECTION_SETTING_KEY },
  });
  if (!record) {
    return null;
  }
  const parsed = parseSelectionPayload(record.value);
  if (!parsed) {
    return null;
  }
  return hydrateSelection(parsed.provider, parsed.model);
}

export async function saveImageSelectionSettings(input: {
  provider: string;
  model: string;
}): Promise<ImageSelectionSettings> {
  const provider = normalizeProvider(input.provider);
  const model = normalizeModel(input.model);
  if (!provider) {
    throw new Error("图片模型厂商不能为空。");
  }
  if (!model) {
    throw new Error("图片模型名称不能为空。");
  }
  const settings: ImageSelectionSettings = { provider, model };
  await prisma.appSetting.upsert({
    where: { key: IMAGE_SELECTION_SETTING_KEY },
    update: { value: serializeSelection(settings) },
    create: { key: IMAGE_SELECTION_SETTING_KEY, value: serializeSelection(settings) },
  });
  return settings;
}
