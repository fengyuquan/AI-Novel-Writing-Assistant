import type { LlmPromptLogSettings } from "@ai-novel/shared/types/llmPromptLog";
import { prisma } from "../../../db/prisma";
import { isMissingTableError } from "../../../services/settings/ragLegacyCompatibility";
import {
  LLM_PROMPT_LOG_DEFAULT_ENABLED,
  LLM_PROMPT_LOG_DEFAULT_RETENTION_COUNT,
  LLM_PROMPT_LOG_ENABLED_KEY,
  LLM_PROMPT_LOG_MAX_RETENTION_COUNT,
  LLM_PROMPT_LOG_MIN_RETENTION_COUNT,
  LLM_PROMPT_LOG_RETENTION_COUNT_KEY,
  LLM_PROMPT_LOG_SETTING_KEYS,
} from "./promptLogConstants";

interface AppSettingStore {
  findMany(args: {
    where: {
      key: {
        in: string[];
      };
    };
  }): Promise<Array<{ key: string; value: string }>>;
  upsert(args: {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  }): Promise<unknown>;
}

export interface PromptLogSettingsDeps {
  appSettingStore?: AppSettingStore;
  transaction?: (operations: Promise<unknown>[]) => Promise<unknown[]>;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function parseRetentionCount(value: string | undefined): number {
  if (value === undefined) {
    return LLM_PROMPT_LOG_DEFAULT_RETENTION_COUNT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return LLM_PROMPT_LOG_DEFAULT_RETENTION_COUNT;
  }
  return Math.min(
    LLM_PROMPT_LOG_MAX_RETENTION_COUNT,
    Math.max(LLM_PROMPT_LOG_MIN_RETENTION_COUNT, parsed),
  );
}

function buildSettings(valueMap: Map<string, string>): LlmPromptLogSettings {
  return {
    enabled: parseBoolean(valueMap.get(LLM_PROMPT_LOG_ENABLED_KEY), LLM_PROMPT_LOG_DEFAULT_ENABLED),
    retentionCount: parseRetentionCount(valueMap.get(LLM_PROMPT_LOG_RETENTION_COUNT_KEY)),
  };
}

export class PromptLogSettingsService {
  constructor(private readonly deps: PromptLogSettingsDeps = {}) {}

  private getStore(): AppSettingStore {
    return (this.deps.appSettingStore ?? prisma.appSetting) as unknown as AppSettingStore;
  }

  async getSettings(): Promise<LlmPromptLogSettings> {
    try {
      const records = await this.getStore().findMany({
        where: {
          key: {
            in: [...LLM_PROMPT_LOG_SETTING_KEYS],
          },
        },
      });
      return buildSettings(new Map(records.map((item) => [item.key, item.value])));
    } catch (error) {
      if (isMissingTableError(error)) {
        return buildSettings(new Map());
      }
      throw error;
    }
  }

  async saveSettings(input: Partial<LlmPromptLogSettings>): Promise<LlmPromptLogSettings> {
    const current = await this.getSettings();
    const next: LlmPromptLogSettings = {
      enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
      retentionCount: input.retentionCount === undefined
        ? current.retentionCount
        : parseRetentionCount(String(input.retentionCount)),
    };

    const operations = [
      this.getStore().upsert({
        where: { key: LLM_PROMPT_LOG_ENABLED_KEY },
        update: { value: next.enabled ? "true" : "false" },
        create: { key: LLM_PROMPT_LOG_ENABLED_KEY, value: next.enabled ? "true" : "false" },
      }),
      this.getStore().upsert({
        where: { key: LLM_PROMPT_LOG_RETENTION_COUNT_KEY },
        update: { value: String(next.retentionCount) },
        create: { key: LLM_PROMPT_LOG_RETENTION_COUNT_KEY, value: String(next.retentionCount) },
      }),
    ];

    if (this.deps.transaction) {
      await this.deps.transaction(operations);
    } else {
      await Promise.all(operations);
    }

    return next;
  }
}

export const promptLogSettingsService = new PromptLogSettingsService();
