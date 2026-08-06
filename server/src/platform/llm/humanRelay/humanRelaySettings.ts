import type { LlmHumanRelaySettings } from "@ai-novel/shared/types/llmHumanRelay";
import { prisma } from "../../../db/prisma";
import { isMissingTableError } from "../../../services/settings/ragLegacyCompatibility";
import {
  LLM_HUMAN_RELAY_DEFAULT_ENABLED,
  LLM_HUMAN_RELAY_ENABLED_KEY,
  LLM_HUMAN_RELAY_SETTING_KEYS,
} from "./humanRelayConstants";

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

export interface HumanRelaySettingsDeps {
  appSettingStore?: AppSettingStore;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function buildSettings(valueMap: Map<string, string>): LlmHumanRelaySettings {
  return {
    enabled: parseBoolean(valueMap.get(LLM_HUMAN_RELAY_ENABLED_KEY), LLM_HUMAN_RELAY_DEFAULT_ENABLED),
  };
}

export class HumanRelaySettingsService {
  constructor(private readonly deps: HumanRelaySettingsDeps = {}) {}

  private getStore(): AppSettingStore {
    return (this.deps.appSettingStore ?? prisma.appSetting) as unknown as AppSettingStore;
  }

  async getSettings(): Promise<LlmHumanRelaySettings> {
    try {
      const records = await this.getStore().findMany({
        where: {
          key: {
            in: [...LLM_HUMAN_RELAY_SETTING_KEYS],
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

  async saveSettings(input: Partial<LlmHumanRelaySettings>): Promise<LlmHumanRelaySettings> {
    const current = await this.getSettings();
    const next: LlmHumanRelaySettings = {
      enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
    };

    await this.getStore().upsert({
      where: { key: LLM_HUMAN_RELAY_ENABLED_KEY },
      update: { value: next.enabled ? "true" : "false" },
      create: { key: LLM_HUMAN_RELAY_ENABLED_KEY, value: next.enabled ? "true" : "false" },
    });

    return next;
  }
}

export const humanRelaySettingsService = new HumanRelaySettingsService();
