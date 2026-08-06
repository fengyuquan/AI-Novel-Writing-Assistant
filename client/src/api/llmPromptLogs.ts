import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  LlmPromptLogClearResult,
  LlmPromptLogDetail,
  LlmPromptLogListResult,
  LlmPromptLogSettings,
} from "@ai-novel/shared/types/llmPromptLog";
import { apiClient } from "./client";
import { API_BASE_URL } from "@/lib/constants";

export interface LlmPromptLogListParams {
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

function toQuery(params: LlmPromptLogListParams = {}): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  if (params.page != null) query.page = params.page;
  if (params.pageSize != null) query.pageSize = params.pageSize;
  if (params.provider?.trim()) query.provider = params.provider.trim();
  if (params.promptAssetKey?.trim()) query.promptAssetKey = params.promptAssetKey.trim();
  if (params.novelId?.trim()) query.novelId = params.novelId.trim();
  if (params.taskId?.trim()) query.taskId = params.taskId.trim();
  if (params.taskType?.trim()) query.taskType = params.taskType.trim();
  if (params.q?.trim()) query.q = params.q.trim();
  if (params.ids && params.ids.length > 0) query.ids = params.ids.join(",");
  return query;
}

export async function getLlmPromptLogSettings() {
  const { data } = await apiClient.get<ApiResponse<LlmPromptLogSettings>>("/llm/prompt-logs/settings");
  return data;
}

export async function saveLlmPromptLogSettings(payload: Partial<LlmPromptLogSettings>) {
  const { data } = await apiClient.put<ApiResponse<LlmPromptLogSettings>>("/llm/prompt-logs/settings", payload);
  return data;
}

export async function listLlmPromptLogs(params: LlmPromptLogListParams = {}) {
  const { data } = await apiClient.get<ApiResponse<LlmPromptLogListResult>>("/llm/prompt-logs", {
    params: toQuery(params),
  });
  return data;
}

export async function getLlmPromptLog(id: string) {
  const { data } = await apiClient.get<ApiResponse<LlmPromptLogDetail>>(`/llm/prompt-logs/${id}`);
  return data;
}

export async function clearLlmPromptLogs(payload: LlmPromptLogListParams = {}) {
  const { data } = await apiClient.delete<ApiResponse<LlmPromptLogClearResult>>("/llm/prompt-logs", {
    data: {
      ids: payload.ids,
      provider: payload.provider,
      promptAssetKey: payload.promptAssetKey,
      novelId: payload.novelId,
      taskId: payload.taskId,
      taskType: payload.taskType,
      q: payload.q,
    },
  });
  return data;
}

export async function exportLlmPromptLogs(
  params: LlmPromptLogListParams & { format?: "jsonl" | "json" } = {},
): Promise<Blob> {
  const { format = "jsonl", ...rest } = params;
  const query = new URLSearchParams();
  const mapped = toQuery(rest);
  for (const [key, value] of Object.entries(mapped)) {
    query.set(key, String(value));
  }
  query.set("format", format);
  const response = await apiClient.get(`/llm/prompt-logs/export?${query.toString()}`, {
    responseType: "blob",
    baseURL: API_BASE_URL,
  });
  return response.data as Blob;
}
