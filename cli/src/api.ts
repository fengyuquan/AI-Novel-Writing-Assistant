import type { CreativeHubStreamFrame } from "@ai-novel/shared/types/api";
import type {
  CreativeHubMessage,
  CreativeHubThread,
  CreativeHubThreadState,
} from "@ai-novel/shared/types/creativeHub";
import type {
  DirectorBookAutomationProjectionResponse,
  DirectorCommandAcceptedResponse,
  DirectorCommandResultResponse,
  DirectorTaskSnapshotResponse,
} from "@ai-novel/shared/types/directorRuntime";
import type { LlmLiveStreamFrame } from "@ai-novel/shared/types/llmLive";
import type { Chapter, Novel } from "@ai-novel/shared/types/novel";
import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorConfirmRequest,
  DirectorCorrectionPreset,
  DirectorStepCalibrationRequest,
} from "@ai-novel/shared/types/novelDirector";
import type {
  CompleteQuickSetupRequest,
  CompleteQuickSetupResult,
  FirstNovelOnboardingProjection,
  QuickSetupStatus,
} from "@ai-novel/shared/types/onboarding";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { TaskOverviewSummary, UnifiedTaskListResponse } from "@ai-novel/shared/types/task";
import type { ApiClient } from "./lib/http.js";
import { readSseJsonFrames } from "./lib/sse.js";

export interface OutlineOptimizePreview {
  optimizedDraft: string;
  mode?: string;
  selectedText?: string;
}
export interface NovelListItem {
  id: string;
  title: string;
  description?: string | null;
  updatedAt?: string;
  projectMode?: string | null;
  creationExperience?: string | null;
}

export interface NovelListResponse {
  items?: NovelListItem[];
  novels?: NovelListItem[];
  total?: number;
}

export function createApi(client: ApiClient) {
  return {
    health() {
      return client.get<{ status: string; timestamp?: string }>("/health");
    },

    getQuickSetupStatus() {
      return client.get<QuickSetupStatus>("/settings/quick-setup/status");
    },

    completeQuickSetup(payload: CompleteQuickSetupRequest) {
      return client.post<CompleteQuickSetupResult>("/settings/quick-setup/complete", payload);
    },

    getFirstNovelOnboarding() {
      return client.get<FirstNovelOnboardingProjection>("/onboarding/first-novel");
    },

    listNovels(page = 1, limit = 20) {
      return client.get<NovelListResponse>("/novels", { page, limit });
    },

    getNovel(id: string) {
      return client.get<{ novel?: Novel } & Novel>(`/novels/${id}`);
    },

    createNovel(payload: {
      title: string;
      description?: string;
      projectMode?: string;
      creationExperience?: string;
      estimatedChapterCount?: number;
      defaultChapterLength?: number;
    }) {
      return client.post<Novel>("/novels", payload);
    },

    generateDirectorCandidates(payload: {
      idea: string;
      novelId?: string;
      workflowTaskId?: string;
      provider?: string;
      model?: string;
      estimatedChapterCount?: number;
      defaultChapterLength?: number;
    }) {
      return client.post<DirectorCommandAcceptedResponse>("/novels/director/tasks", {
        taskType: "generate_candidates",
        payload,
      });
    },

    refineDirectorCandidates(taskId: string, payload: {
      idea: string;
      previousBatches: DirectorCandidateBatch[];
      feedback?: string;
      presets?: DirectorCorrectionPreset[];
      workflowTaskId?: string;
      estimatedChapterCount?: number;
      defaultChapterLength?: number;
    }) {
      return client.post<DirectorCommandAcceptedResponse>(`/novels/director/tasks/${taskId}/commands`, {
        commandType: "refine_candidates",
        payload,
      });
    },

    exportNovelRaw(novelId: string, format: "markdown" | "json" | "txt" = "markdown", scope = "chapter") {
      return client.requestRaw(`/novels/${novelId}/export?format=${encodeURIComponent(format)}&scope=${encodeURIComponent(scope)}`, {
        method: "GET",
      });
    },

    getDirectorTaskSnapshot(taskId: string) {
      return client.get<DirectorTaskSnapshotResponse>(`/novels/director/tasks/${taskId}`);
    },

    getDirectorBookAutomation(novelId: string) {
      return client.get<DirectorBookAutomationProjectionResponse>(`/novels/director/book-automation/${novelId}`);
    },

    continueDirector(taskId: string, payload: Record<string, unknown> = {}) {
      return client.post<DirectorCommandAcceptedResponse>(`/novels/director/tasks/${taskId}/commands`, {
        commandType: "continue",
        payload,
      });
    },

    approveDirectorGate(taskId: string) {
      return client.post<DirectorCommandAcceptedResponse>(`/novels/director/tasks/${taskId}/commands`, {
        commandType: "approve_gate",
        payload: {},
      });
    },

    calibrateDirectorStep(taskId: string, payload: DirectorStepCalibrationRequest) {
      return client.post<DirectorCommandAcceptedResponse>(`/novels/director/tasks/${taskId}/commands`, {
        commandType: "calibrate_step",
        payload,
      });
    },

    acceptManualChangesAndContinue(taskId: string) {
      return client.post<DirectorCommandAcceptedResponse>(`/novels/director/tasks/${taskId}/commands`, {
        commandType: "accept_manual_changes_and_continue",
        payload: {},
      });
    },

    getStoryMacro(novelId: string) {
      return client.get<StoryMacroPlan | null>(`/novels/${novelId}/story-macro`);
    },

    optimizeOutlinePreview(novelId: string, payload: { currentDraft: string; instruction: string; mode?: "full" | "selection" }) {
      return client.post<OutlineOptimizePreview>(`/novels/${novelId}/outline/optimize-preview`, payload);
    },

    updateNovel(novelId: string, payload: Partial<Pick<Novel, "outline" | "structuredOutline" | "title" | "description" | "estimatedChapterCount" | "defaultChapterLength">>) {
      return client.put<Novel>(`/novels/${novelId}`, payload);
    },

    confirmDirectorCandidate(taskId: string, payload: DirectorConfirmRequest) {
      return client.post<DirectorCommandAcceptedResponse>(`/novels/director/tasks/${taskId}/commands`, {
        commandType: "confirm_candidate",
        payload,
      });
    },

    getDirectorCommandResult<T = unknown>(commandId: string) {
      return client.get<DirectorCommandResultResponse<T>>(`/novels/director/commands/${commandId}/result`);
    },

    listChapters(novelId: string) {
      return client.get<Chapter[]>(`/novels/${novelId}/chapters`);
    },

    getChapter(novelId: string, chapterId: string) {
      return client.get<Chapter>(`/novels/${novelId}/chapters/${chapterId}`);
    },

    listTasks(limit = 20) {
      return client.get<UnifiedTaskListResponse>("/tasks", { limit });
    },

    getTaskOverview() {
      return client.get<TaskOverviewSummary>("/tasks/overview");
    },

    async *streamLlmLive(taskId?: string): AsyncGenerator<LlmLiveStreamFrame> {
      const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
      const response = await client.requestRaw(`/llm-live/stream${query}`, { method: "GET" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI 实况连接失败（HTTP ${response.status}）：${text.slice(0, 200)}`);
      }
      yield* readSseJsonFrames<LlmLiveStreamFrame>(response);
    },

    listCreativeHubThreads() {
      return client.get<CreativeHubThread[]>("/creative-hub/threads");
    },

    createCreativeHubThread(payload?: { title?: string; resourceBindings?: { novelId?: string } }) {
      return client.post<CreativeHubThread>("/creative-hub/threads", payload ?? {});
    },

    getCreativeHubState(threadId: string) {
      return client.get<CreativeHubThreadState>(`/creative-hub/threads/${threadId}/state`);
    },

    async *streamCreativeHubRun(
      threadId: string,
      payload: {
        messages: CreativeHubMessage[];
        provider?: string;
        model?: string;
      },
    ): AsyncGenerator<CreativeHubStreamFrame> {
      const response = await client.requestRaw(`/creative-hub/threads/${threadId}/runs/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`创作中枢请求失败（HTTP ${response.status}）：${text.slice(0, 200)}`);
      }
      yield* readSseJsonFrames<CreativeHubStreamFrame>(response);
    },
  };
}

export type NovelCliApi = ReturnType<typeof createApi>;

export type CandidateCommandResult = {
  batch: DirectorCandidateBatch;
  workflowTaskId?: string;
  candidate?: DirectorCandidate;
};

export function unwrapNovels(data: NovelListResponse | null | undefined): NovelListItem[] {
  if (!data) {
    return [];
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data.novels)) {
    return data.novels;
  }
  return [];
}

export function unwrapNovel(data: ({ novel?: Novel } & Novel) | null | undefined): Novel | null {
  if (!data) {
    return null;
  }
  if (data.novel && typeof data.novel === "object") {
    return data.novel;
  }
  if (typeof data.id === "string" && typeof data.title === "string") {
    return data;
  }
  return null;
}
