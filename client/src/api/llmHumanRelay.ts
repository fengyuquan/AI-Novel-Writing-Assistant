import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  LlmHumanRelayActionResult,
  LlmHumanRelayPendingList,
  LlmHumanRelayResolveInput,
  LlmHumanRelaySettings,
} from "@ai-novel/shared/types/llmHumanRelay";
import { apiClient } from "./client";

export async function getLlmHumanRelaySettings() {
  const { data } = await apiClient.get<ApiResponse<LlmHumanRelaySettings>>("/llm/human-relay/settings");
  return data;
}

export async function saveLlmHumanRelaySettings(payload: Partial<LlmHumanRelaySettings>) {
  const { data } = await apiClient.put<ApiResponse<LlmHumanRelaySettings>>("/llm/human-relay/settings", payload);
  return data;
}

export async function listLlmHumanRelayPending() {
  const { data } = await apiClient.get<ApiResponse<LlmHumanRelayPendingList>>("/llm/human-relay/pending");
  return data;
}

export async function resolveLlmHumanRelay(id: string, payload: LlmHumanRelayResolveInput) {
  const { data } = await apiClient.post<ApiResponse<LlmHumanRelayActionResult>>(
    `/llm/human-relay/${encodeURIComponent(id)}/resolve`,
    payload,
  );
  return data;
}

export async function cancelLlmHumanRelay(id: string) {
  const { data } = await apiClient.post<ApiResponse<LlmHumanRelayActionResult>>(
    `/llm/human-relay/${encodeURIComponent(id)}/cancel`,
  );
  return data;
}
