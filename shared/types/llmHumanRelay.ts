export interface LlmHumanRelaySettings {
  /** 开启后，系统调用模型前会先等待你粘贴外部 API 的返回结果。 */
  enabled: boolean;
}

export interface LlmHumanRelayMessageEntry {
  role: string;
  content: string;
}

export type LlmHumanRelayMessagesPayload =
  | LlmHumanRelayMessageEntry[]
  | string
  | Array<{ index: number; payload: LlmHumanRelayMessageEntry[] | string }>;

export interface LlmHumanRelayPendingRequest {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  taskType: string | null;
  method: "invoke" | "stream" | "batch";
  promptAssetKey: string | null;
  promptVersion: string | null;
  novelId: string | null;
  taskId: string | null;
  chapterId: string | null;
  /** 便于直接复制给外部 API 的纯文本提示词。 */
  promptText: string;
  messages: LlmHumanRelayMessagesPayload;
}

export interface LlmHumanRelayPendingList {
  enabled: boolean;
  items: LlmHumanRelayPendingRequest[];
}

export interface LlmHumanRelayResolveInput {
  responseText: string;
}

export interface LlmHumanRelayActionResult {
  id: string;
  status: "resolved" | "cancelled";
}

export type LlmHumanRelayEvent =
  | { type: "pending_added"; at: string; item: LlmHumanRelayPendingRequest }
  | { type: "pending_resolved"; at: string; id: string; status: "resolved" | "cancelled" }
  | { type: "settings_changed"; at: string; enabled: boolean };

export type LlmHumanRelayStreamFrame =
  | { type: "snapshot"; pending: LlmHumanRelayPendingList }
  | { type: "event"; event: LlmHumanRelayEvent }
  | { type: "ping" };
