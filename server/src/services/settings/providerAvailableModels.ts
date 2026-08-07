import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { isBuiltInProvider, PROVIDERS } from "../../llm/providers";
import { secretStore } from "./secretStore";

export function parseAvailableModelsJson(value: string | null | undefined): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return Array.from(new Set(
      parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ));
  } catch {
    return [];
  }
}

export function serializeAvailableModelsJson(models: string[]): string {
  return JSON.stringify(Array.from(new Set(
    models.map((item) => item.trim()).filter(Boolean),
  )));
}

export function mergeProviderModelCandidates(options: {
  provider: LLMProvider;
  currentModel?: string | null;
  persistedModels?: string[] | null;
}): string[] {
  const builtInModels = isBuiltInProvider(options.provider) ? PROVIDERS[options.provider].models : [];
  const persisted = options.persistedModels ?? [];
  const currentModel = typeof options.currentModel === "string" ? options.currentModel.trim() : "";
  return Array.from(new Set([...builtInModels, ...persisted, currentModel].filter(Boolean)));
}

export async function persistProviderAvailableModels(
  provider: LLMProvider,
  models: string[],
): Promise<string[]> {
  const normalized = Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    return normalized;
  }
  if (!(await secretStore.hasProvider(provider))) {
    return normalized;
  }
  await secretStore.updateProvider(provider, {
    availableModelsJson: serializeAvailableModelsJson(normalized),
  });
  return normalized;
}
