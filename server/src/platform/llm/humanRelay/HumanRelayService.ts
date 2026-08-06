import { randomUUID } from "node:crypto";
import type {
  LlmHumanRelayActionResult,
  LlmHumanRelayMessagesPayload,
  LlmHumanRelayPendingList,
  LlmHumanRelayPendingRequest,
  LlmHumanRelaySettings,
} from "@ai-novel/shared/types/llmHumanRelay";
import { LLM_HUMAN_RELAY_MAX_RESPONSE_CHARS } from "./humanRelayConstants";
import { humanRelaySettingsService } from "./humanRelaySettings";

export type LlmHumanRelayEvent =
  | { type: "pending_added"; at: string; item: LlmHumanRelayPendingRequest }
  | { type: "pending_resolved"; at: string; id: string; status: "resolved" | "cancelled" }
  | { type: "settings_changed"; at: string; enabled: boolean };

interface PendingWaiter {
  request: LlmHumanRelayPendingRequest;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

export class HumanRelayCancelledError extends Error {
  readonly code = "LLM_HUMAN_RELAY_CANCELLED";

  constructor(requestId: string, reason = "人工中继已取消") {
    super(`${reason} (id=${requestId})`);
    this.name = "HumanRelayCancelledError";
  }
}

export class HumanRelayService {
  private readonly waiters = new Map<string, PendingWaiter>();
  private readonly listeners = new Set<(event: LlmHumanRelayEvent) => void>();
  private enabledCache: boolean | null = null;

  subscribe(listener: (event: LlmHumanRelayEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(event: LlmHumanRelayEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not break the relay wait path.
      }
    }
  }

  async getSettings(): Promise<LlmHumanRelaySettings> {
    const settings = await humanRelaySettingsService.getSettings();
    this.enabledCache = settings.enabled;
    return settings;
  }

  async saveSettings(input: Partial<LlmHumanRelaySettings>): Promise<LlmHumanRelaySettings> {
    const settings = await humanRelaySettingsService.saveSettings(input);
    this.enabledCache = settings.enabled;
    this.publish({
      type: "settings_changed",
      at: new Date().toISOString(),
      enabled: settings.enabled,
    });
    if (!settings.enabled) {
      this.cancelAll("人工中继已关闭，待处理请求已取消");
    }
    return settings;
  }

  async isEnabled(): Promise<boolean> {
    if (this.enabledCache != null) {
      return this.enabledCache;
    }
    const settings = await this.getSettings();
    return settings.enabled;
  }

  listPending(): LlmHumanRelayPendingList {
    return {
      enabled: this.enabledCache ?? false,
      items: [...this.waiters.values()]
        .map((entry) => entry.request)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    };
  }

  async listPendingWithSettings(): Promise<LlmHumanRelayPendingList> {
    const enabled = await this.isEnabled();
    return {
      enabled,
      items: this.listPending().items,
    };
  }

  waitForResponse(input: {
    provider: string;
    model: string;
    taskType: string | null;
    method: LlmHumanRelayPendingRequest["method"];
    promptAssetKey: string | null;
    promptVersion: string | null;
    novelId: string | null;
    taskId: string | null;
    chapterId: string | null;
    promptText: string;
    messages: LlmHumanRelayMessagesPayload;
    signal?: AbortSignal;
  }): Promise<string> {
    if (input.signal?.aborted) {
      return Promise.reject(new HumanRelayCancelledError("unknown", "人工中继等待已中止"));
    }

    const id = randomUUID();
    const request: LlmHumanRelayPendingRequest = {
      id,
      createdAt: new Date().toISOString(),
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      method: input.method,
      promptAssetKey: input.promptAssetKey,
      promptVersion: input.promptVersion,
      novelId: input.novelId,
      taskId: input.taskId,
      chapterId: input.chapterId,
      promptText: input.promptText,
      messages: input.messages,
    };

    return new Promise<string>((resolve, reject) => {
      const abortHandler = () => {
        this.cancel(id, "人工中继等待已中止");
      };
      const waiter: PendingWaiter = {
        request,
        resolve,
        reject,
        abortHandler,
        signal: input.signal,
      };
      this.waiters.set(id, waiter);
      input.signal?.addEventListener("abort", abortHandler, { once: true });
      this.publish({
        type: "pending_added",
        at: request.createdAt,
        item: request,
      });
    });
  }

  resolve(id: string, responseText: string): LlmHumanRelayActionResult {
    const trimmedId = id.trim();
    const waiter = this.waiters.get(trimmedId);
    if (!waiter) {
      throw new Error(`未找到待处理的人工中继请求：${trimmedId}`);
    }

    const text = String(responseText ?? "");
    if (!text.trim()) {
      throw new Error("请粘贴外部 API 返回的内容后再提交。");
    }
    if (text.length > LLM_HUMAN_RELAY_MAX_RESPONSE_CHARS) {
      throw new Error(`粘贴内容过长，最多 ${LLM_HUMAN_RELAY_MAX_RESPONSE_CHARS} 个字符。`);
    }

    this.detachAbort(waiter);
    this.waiters.delete(trimmedId);
    waiter.resolve(text);
    this.publish({
      type: "pending_resolved",
      at: new Date().toISOString(),
      id: trimmedId,
      status: "resolved",
    });
    return { id: trimmedId, status: "resolved" };
  }

  cancel(id: string, reason?: string): LlmHumanRelayActionResult {
    const trimmedId = id.trim();
    const waiter = this.waiters.get(trimmedId);
    if (!waiter) {
      throw new Error(`未找到待处理的人工中继请求：${trimmedId}`);
    }
    this.detachAbort(waiter);
    this.waiters.delete(trimmedId);
    waiter.reject(new HumanRelayCancelledError(trimmedId, reason));
    this.publish({
      type: "pending_resolved",
      at: new Date().toISOString(),
      id: trimmedId,
      status: "cancelled",
    });
    return { id: trimmedId, status: "cancelled" };
  }

  cancelAll(reason?: string): number {
    const ids = [...this.waiters.keys()];
    for (const id of ids) {
      try {
        this.cancel(id, reason);
      } catch {
        // Ignore races while draining.
      }
    }
    return ids.length;
  }

  private detachAbort(waiter: PendingWaiter): void {
    if (waiter.signal && waiter.abortHandler) {
      waiter.signal.removeEventListener("abort", waiter.abortHandler);
    }
  }
}

export const humanRelayService = new HumanRelayService();
