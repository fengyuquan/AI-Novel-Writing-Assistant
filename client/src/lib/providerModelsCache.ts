import type { APIKeyStatus } from "@/api/settings";

const STORAGE_KEY = "ai-novel.provider-models-cache.v1";

type ProviderModelsCacheEntry = {
  models: string[];
  updatedAt: number;
  baseURL?: string;
};

type ProviderModelsCacheStore = Record<string, ProviderModelsCacheEntry>;

function sanitizeModelList(models: unknown): string[] {
  if (!Array.isArray(models)) {
    return [];
  }
  return Array.from(
    new Set(
      models
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function buildCacheKey(provider: string, baseURL?: string): string {
  return `${provider}::${(baseURL ?? "").trim()}`;
}

function readStore(): ProviderModelsCacheStore {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ProviderModelsCacheStore;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(store: ProviderModelsCacheStore): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private-mode write failures; selector still works with API payload.
  }
}

export function readProviderModelsCache(provider: string, baseURL?: string): string[] | null {
  const entry = readStore()[buildCacheKey(provider, baseURL)];
  if (!entry || !Array.isArray(entry.models) || entry.models.length === 0) {
    return null;
  }
  return sanitizeModelList(entry.models);
}

export function writeProviderModelsCache(
  provider: string,
  models: string[],
  baseURL?: string,
): string[] {
  const normalized = sanitizeModelList(models);
  if (normalized.length === 0) {
    return normalized;
  }
  const store = readStore();
  store[buildCacheKey(provider, baseURL)] = {
    models: normalized,
    updatedAt: Date.now(),
    ...(baseURL ? { baseURL } : {}),
  };
  writeStore(store);
  return normalized;
}

/** Prefer durable local cache; fall back to API key payload models. */
export function resolveProviderModelsFromCache(config: APIKeyStatus): string[] {
  const cached = readProviderModelsCache(config.provider, config.currentBaseURL);
  if (cached && cached.length > 0) {
    return sanitizeModelList([config.currentModel, ...cached]);
  }
  return sanitizeModelList([config.currentModel, ...(config.models ?? [])]);
}
