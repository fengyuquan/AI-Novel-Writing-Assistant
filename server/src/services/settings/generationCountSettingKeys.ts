import {
  GENERATION_COUNT_FIELD_DESCRIPTORS,
  type GenerationCountFieldKey,
} from "@ai-novel/shared/types/generationCounts";

export const GENERATION_COUNT_SETTING_KEYS = GENERATION_COUNT_FIELD_DESCRIPTORS.map(
  (field) => field.settingKey,
) as readonly string[];

export const GENERATION_COUNT_SETTING_KEY_BY_FIELD: Record<GenerationCountFieldKey, string> =
  Object.fromEntries(
    GENERATION_COUNT_FIELD_DESCRIPTORS.map((field) => [field.key, field.settingKey]),
  ) as Record<GenerationCountFieldKey, string>;
