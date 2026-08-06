import type {
  LlmPromptLogClearResult,
  LlmPromptLogDetail,
  LlmPromptLogExportRecord,
  LlmPromptLogListItem,
  LlmPromptLogListResult,
  LlmPromptLogMessagesPayload,
  LlmPromptLogSettings,
} from "@ai-novel/shared/types/llmPromptLog";
import { prisma } from "../../../db/prisma";
import { isMissingTableError } from "../../../services/settings/ragLegacyCompatibility";
import { LLM_PROMPT_LOG_MAX_MESSAGE_CHARS } from "./promptLogConstants";
import { promptLogSettingsService, type PromptLogSettingsService } from "./promptLogSettings";

export interface PromptLogRecordRequestInput {
  requestId: string;
  provider: string;
  model: string;
  taskType?: string | null;
  method: "invoke" | "stream" | "batch";
  promptAssetKey?: string | null;
  promptVersion?: string | null;
  novelId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  nodeKey?: string | null;
  chapterId?: string | null;
  messages: unknown;
}

export interface PromptLogListQuery {
  page?: number;
  pageSize?: number;
  provider?: string;
  promptAssetKey?: string;
  novelId?: string;
  taskId?: string;
  taskType?: string;
  q?: string;
  ids?: string[];
}

interface PromptLogRow {
  id: string;
  requestId: string;
  provider: string;
  model: string;
  taskType: string | null;
  method: string;
  promptAssetKey: string | null;
  promptVersion: string | null;
  novelId: string | null;
  taskId: string | null;
  runId: string | null;
  nodeKey: string | null;
  chapterId: string | null;
  messagesJson: string;
  messageChars: number;
  messageCount: number;
  truncated: boolean;
  createdAt: Date;
}

interface PromptLogStore {
  create(args: {
    data: {
      requestId: string;
      provider: string;
      model: string;
      taskType: string | null;
      method: string;
      promptAssetKey: string | null;
      promptVersion: string | null;
      novelId: string | null;
      taskId: string | null;
      runId: string | null;
      nodeKey: string | null;
      chapterId: string | null;
      messagesJson: string;
      messageChars: number;
      messageCount: number;
      truncated: boolean;
    };
  }): Promise<PromptLogRow>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: { createdAt: "desc" | "asc" };
    skip?: number;
    take?: number;
    select?: Record<string, boolean>;
  }): Promise<PromptLogRow[]>;
  findFirst(args: {
    where: { id: string };
  }): Promise<PromptLogRow | null>;
  count(args: { where?: Record<string, unknown> }): Promise<number>;
  deleteMany(args: { where?: Record<string, unknown> }): Promise<{ count: number }>;
}

export interface PromptLogServiceDeps {
  store?: PromptLogStore;
  settingsService?: PromptLogSettingsService;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function countMessages(payload: unknown): number {
  if (Array.isArray(payload)) {
    if (payload.every((item) => item && typeof item === "object" && "payload" in (item as object))) {
      return payload.reduce((sum, item) => {
        const nested = (item as { payload?: unknown }).payload;
        return sum + countMessages(nested);
      }, 0);
    }
    return payload.length;
  }
  return payload == null ? 0 : 1;
}

export function prepareMessagesPayload(messages: unknown, maxChars = LLM_PROMPT_LOG_MAX_MESSAGE_CHARS): {
  messagesJson: string;
  messageChars: number;
  messageCount: number;
  truncated: boolean;
} {
  const messageCount = countMessages(messages);
  let messagesJson: string;
  try {
    messagesJson = JSON.stringify(messages ?? null);
  } catch {
    messagesJson = JSON.stringify(String(messages));
  }

  let truncated = false;
  if (messagesJson.length > maxChars) {
    truncated = true;
    const truncatedBody = messagesJson.slice(0, maxChars);
    messagesJson = JSON.stringify({
      truncated: true,
      originalChars: messagesJson.length,
      preview: truncatedBody,
    });
  }

  return {
    messagesJson,
    messageChars: messagesJson.length,
    messageCount,
    truncated,
  };
}

function parseMessagesJson(raw: string): LlmPromptLogMessagesPayload {
  try {
    return JSON.parse(raw) as LlmPromptLogMessagesPayload;
  } catch {
    return raw;
  }
}

function toListItem(row: PromptLogRow): LlmPromptLogListItem {
  return {
    id: row.id,
    requestId: row.requestId,
    provider: row.provider,
    model: row.model,
    taskType: row.taskType,
    method: row.method,
    promptAssetKey: row.promptAssetKey,
    promptVersion: row.promptVersion,
    novelId: row.novelId,
    taskId: row.taskId,
    runId: row.runId,
    nodeKey: row.nodeKey,
    chapterId: row.chapterId,
    messageChars: row.messageChars,
    messageCount: row.messageCount,
    truncated: row.truncated,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: PromptLogRow): LlmPromptLogDetail {
  return {
    ...toListItem(row),
    messages: parseMessagesJson(row.messagesJson),
  };
}

function toExportRecord(row: PromptLogRow): LlmPromptLogExportRecord {
  return {
    ...toListItem(row),
    messages: parseMessagesJson(row.messagesJson),
  };
}

function buildWhere(query: PromptLogListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (query.ids && query.ids.length > 0) {
    where.id = { in: query.ids };
  }
  if (query.provider?.trim()) {
    where.provider = query.provider.trim();
  }
  if (query.promptAssetKey?.trim()) {
    where.promptAssetKey = query.promptAssetKey.trim();
  }
  if (query.novelId?.trim()) {
    where.novelId = query.novelId.trim();
  }
  if (query.taskId?.trim()) {
    where.taskId = query.taskId.trim();
  }
  if (query.taskType?.trim()) {
    where.taskType = query.taskType.trim();
  }
  const keyword = query.q?.trim();
  if (keyword) {
    where.OR = [
      { promptAssetKey: { contains: keyword } },
      { requestId: { contains: keyword } },
      { model: { contains: keyword } },
      { provider: { contains: keyword } },
      { taskType: { contains: keyword } },
      { nodeKey: { contains: keyword } },
      { novelId: { contains: keyword } },
      { taskId: { contains: keyword } },
    ];
  }
  return where;
}

export class PromptLogService {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: PromptLogServiceDeps = {}) {}

  private getStore(): PromptLogStore {
    return (this.deps.store ?? prisma.llmPromptInvocationLog) as unknown as PromptLogStore;
  }

  private getSettingsService(): PromptLogSettingsService {
    return this.deps.settingsService ?? promptLogSettingsService;
  }

  private warn(message: string, details?: Record<string, unknown>): void {
    if (this.deps.warn) {
      this.deps.warn(message, details);
      return;
    }
    console.warn(`[llm.promptLog] ${message}`, details ?? "");
  }

  async getSettings(): Promise<LlmPromptLogSettings> {
    return this.getSettingsService().getSettings();
  }

  async saveSettings(input: Partial<LlmPromptLogSettings>): Promise<LlmPromptLogSettings> {
    const next = await this.getSettingsService().saveSettings(input);
    if (next.enabled) {
      await this.prune(next.retentionCount);
    }
    return next;
  }

  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled;
  }

  /**
   * Fire-and-forget request prompt persistence. Never throws to callers.
   */
  recordRequest(input: PromptLogRecordRequestInput): void {
    this.writeQueue = this.writeQueue
      .then(() => this.persistRequest(input))
      .catch((error) => {
        this.warn("failed to persist prompt log", {
          requestId: input.requestId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  async flushPendingWrites(): Promise<void> {
    await this.writeQueue;
  }

  private async persistRequest(input: PromptLogRecordRequestInput): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return;
    }

    const prepared = prepareMessagesPayload(input.messages);
    try {
      await this.getStore().create({
        data: {
          requestId: input.requestId,
          provider: input.provider,
          model: input.model,
          taskType: normalizeOptional(input.taskType),
          method: input.method,
          promptAssetKey: normalizeOptional(input.promptAssetKey),
          promptVersion: normalizeOptional(input.promptVersion),
          novelId: normalizeOptional(input.novelId),
          taskId: normalizeOptional(input.taskId),
          runId: normalizeOptional(input.runId),
          nodeKey: normalizeOptional(input.nodeKey),
          chapterId: normalizeOptional(input.chapterId),
          messagesJson: prepared.messagesJson,
          messageChars: prepared.messageChars,
          messageCount: prepared.messageCount,
          truncated: prepared.truncated,
        },
      });
      await this.prune(settings.retentionCount);
    } catch (error) {
      if (isMissingTableError(error)) {
        this.warn("prompt log table missing; skip persist");
        return;
      }
      throw error;
    }
  }

  async prune(retentionCount?: number): Promise<number> {
    const limit = retentionCount
      ?? (await this.getSettings()).retentionCount;
    try {
      const keep = await this.getStore().findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true },
      });
      const keepIds = keep.map((row) => row.id);
      if (keepIds.length === 0) {
        const cleared = await this.getStore().deleteMany({});
        return cleared.count;
      }
      const deleted = await this.getStore().deleteMany({
        where: {
          id: { notIn: keepIds },
        },
      });
      return deleted.count;
    } catch (error) {
      if (isMissingTableError(error)) {
        return 0;
      }
      throw error;
    }
  }

  async list(query: PromptLogListQuery = {}): Promise<LlmPromptLogListResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where = buildWhere(query);
    try {
      const [total, rows] = await Promise.all([
        this.getStore().count({ where }),
        this.getStore().findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return {
        items: rows.map(toListItem),
        total,
        page,
        pageSize,
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        return { items: [], total: 0, page, pageSize };
      }
      throw error;
    }
  }

  async getById(id: string): Promise<LlmPromptLogDetail | null> {
    try {
      const row = await this.getStore().findFirst({ where: { id } });
      return row ? toDetail(row) : null;
    } catch (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  async exportRecords(query: PromptLogListQuery = {}): Promise<LlmPromptLogExportRecord[]> {
    const where = buildWhere(query);
    try {
      const rows = await this.getStore().findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 2000,
      });
      return rows.map(toExportRecord);
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async clear(query: PromptLogListQuery = {}): Promise<LlmPromptLogClearResult> {
    const where = buildWhere(query);
    try {
      const result = await this.getStore().deleteMany(
        Object.keys(where).length > 0 ? { where } : {},
      );
      return { deletedCount: result.count };
    } catch (error) {
      if (isMissingTableError(error)) {
        return { deletedCount: 0 };
      }
      throw error;
    }
  }
}

export const promptLogService = new PromptLogService();
