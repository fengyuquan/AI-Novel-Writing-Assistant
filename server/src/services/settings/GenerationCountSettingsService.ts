import {
  buildDefaultGenerationCountSettings,
  GENERATION_COUNT_FIELD_DESCRIPTORS,
  type GenerationCountFieldKey,
  type GenerationCountSettings,
  type GenerationCountSettingsInput,
  type GenerationCountSettingsView,
} from "@ai-novel/shared/types/generationCounts";
import { prisma } from "../../db/prisma";
import { isMissingTableError } from "./ragLegacyCompatibility";
import { GENERATION_COUNT_SETTING_KEYS } from "./generationCountSettingKeys";

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseStoredValue(
  raw: string | undefined,
  key: GenerationCountFieldKey,
  fallback: number,
): number {
  const field = GENERATION_COUNT_FIELD_DESCRIPTORS.find((item) => item.key === key);
  if (!field) {
    return fallback;
  }
  return clampInt(Number(raw ?? ""), fallback, field.min, field.max);
}

function buildSettings(valueMap: Map<string, string>): GenerationCountSettings {
  const defaults = buildDefaultGenerationCountSettings();
  const settings = { ...defaults };
  for (const field of GENERATION_COUNT_FIELD_DESCRIPTORS) {
    settings[field.key] = parseStoredValue(
      valueMap.get(field.settingKey),
      field.key,
      defaults[field.key],
    );
  }
  return settings;
}

function toView(settings: GenerationCountSettings): GenerationCountSettingsView {
  return {
    settings,
    fields: GENERATION_COUNT_FIELD_DESCRIPTORS,
  };
}

let cachedSettings: GenerationCountSettings | null = null;

function invalidateCache(): void {
  cachedSettings = null;
}

export class GenerationCountSettingsService {
  async getSettings(): Promise<GenerationCountSettings> {
    if (cachedSettings) {
      return cachedSettings;
    }
    try {
      const records = await prisma.appSetting.findMany({
        where: {
          key: {
            in: [...GENERATION_COUNT_SETTING_KEYS],
          },
        },
      });
      const settings = buildSettings(new Map(records.map((item) => [item.key, item.value])));
      cachedSettings = settings;
      return settings;
    } catch (error) {
      if (isMissingTableError(error)) {
        const defaults = buildDefaultGenerationCountSettings();
        cachedSettings = defaults;
        return defaults;
      }
      throw error;
    }
  }

  async getSettingsView(): Promise<GenerationCountSettingsView> {
    return toView(await this.getSettings());
  }

  async getCount(key: GenerationCountFieldKey): Promise<number> {
    const settings = await this.getSettings();
    return settings[key];
  }

  async saveSettings(input: GenerationCountSettingsInput): Promise<GenerationCountSettingsView> {
    const current = await this.getSettings();
    const next: GenerationCountSettings = { ...current };

    for (const field of GENERATION_COUNT_FIELD_DESCRIPTORS) {
      const raw = input[field.key];
      if (raw === undefined) {
        continue;
      }
      next[field.key] = clampInt(Number(raw), current[field.key], field.min, field.max);
    }

    for (const field of GENERATION_COUNT_FIELD_DESCRIPTORS) {
      if (input[field.key] === undefined) {
        continue;
      }
      await prisma.appSetting.upsert({
        where: { key: field.settingKey },
        update: { value: String(next[field.key]) },
        create: { key: field.settingKey, value: String(next[field.key]) },
      });
    }

    invalidateCache();
    cachedSettings = next;
    return toView(next);
  }
}

export const generationCountSettingsService = new GenerationCountSettingsService();

export async function getGenerationCount(key: GenerationCountFieldKey): Promise<number> {
  return generationCountSettingsService.getCount(key);
}

export async function getGenerationCountSettings(): Promise<GenerationCountSettings> {
  return generationCountSettingsService.getSettings();
}

export async function getGenerationCountSettingsView(): Promise<GenerationCountSettingsView> {
  return generationCountSettingsService.getSettingsView();
}

export async function saveGenerationCountSettings(
  input: GenerationCountSettingsInput,
): Promise<GenerationCountSettingsView> {
  return generationCountSettingsService.saveSettings(input);
}
