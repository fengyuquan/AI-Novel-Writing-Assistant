export interface LlmPromptLogSettings {
  enabled: boolean;
  retentionCount: number;
}

export interface LlmPromptLogListItem {
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
  messageChars: number;
  messageCount: number;
  truncated: boolean;
  createdAt: string;
}

export interface LlmPromptLogMessageEntry {
  role: string;
  content: string;
}

export type LlmPromptLogMessagesPayload =
  | LlmPromptLogMessageEntry[]
  | string
  | Array<{ index: number; payload: LlmPromptLogMessageEntry[] | string }>;

export interface LlmPromptLogDetail extends LlmPromptLogListItem {
  messages: LlmPromptLogMessagesPayload;
}

export interface LlmPromptLogListResult {
  items: LlmPromptLogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LlmPromptLogExportRecord {
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
  messageChars: number;
  messageCount: number;
  truncated: boolean;
  createdAt: string;
  messages: LlmPromptLogMessagesPayload;
}

export interface LlmPromptLogClearResult {
  deletedCount: number;
}
