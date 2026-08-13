import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";
import { apiClient } from "@/api/client";

export async function cancelLlmLiveSession(
  interactionId: string,
  message?: string,
): Promise<LlmLiveSessionSnapshot | { interactionId: string; phase: string }> {
  const res = await apiClient.post<ApiResponse<LlmLiveSessionSnapshot | { interactionId: string; phase: string }>>(
    `/llm-live/sessions/${encodeURIComponent(interactionId)}/cancel`,
    message ? { message } : {},
  );
  return res.data.data!;
}

export async function cancelActiveLlmLiveSessions(input?: {
  taskId?: string;
  message?: string;
}): Promise<{ cancelledCount: number; interactionIds: string[] }> {
  const res = await apiClient.post<ApiResponse<{ cancelledCount: number; interactionIds: string[] }>>(
    "/llm-live/cancel-active",
    {
      ...(input?.taskId ? { taskId: input.taskId } : {}),
      ...(input?.message ? { message: input.message } : {}),
    },
  );
  return res.data.data!;
}
