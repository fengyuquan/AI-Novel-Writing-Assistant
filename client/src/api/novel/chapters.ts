import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  TimelineCheckReport,
  TimelineContextForChapter,
} from "@ai-novel/shared/types/timeline";
import type {
  ChapterEditorAiRevisionRequest,
  ChapterEditorAiRevisionResponse,
  ChapterEditorAiWritingDetectRequest,
  ChapterEditorAiWritingDetectResponse,
  ChapterEditorStyleBenchmarkCacheSession,
  ChapterEditorStyleBenchmarkCompareRequest,
  ChapterEditorStyleBenchmarkCompareResponse,
  ChapterEditorStyleBenchmarkRewriteRequest,
  ChapterEditorStyleBenchmarkRewriteResponse,
  ChapterEditorStyleBenchmarkSourcesResponse,
  Chapter,
  ChapterEditorWorkspaceResponse,
  ChapterEditorRewritePreviewRequest,
  ChapterEditorRewritePreviewResponse,
  ChapterStatus,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface ChapterImageStoryPackShot {
  order: number;
  action: string;
  visualPrompt: string;
  dialogue: string | null;
  location: string | null;
  shotSize: string | null;
  durationSec: number | null;
  characterRefs: string[];
  captionedImagePrompt: string;
}

export interface ChapterImageStoryPack {
  format: "ai-novel.chapter.image-story-pack.v1";
  exportType: "chapter_captioned_image_pack";
  mode: "captioned_image";
  aspectRatio: "9:16";
  summary: string;
  chapter: {
    novelId: string;
    novelTitle: string;
    chapterId: string;
    order: number;
    title: string;
  };
  characters: Array<{
    name: string;
    visualAnchor: string | null;
  }>;
  shots: ChapterImageStoryPackShot[];
  warnings: string[];
  usageHint: string;
}

export async function getNovelChapters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Chapter[]>>(`/novels/${id}/chapters`);
  return data;
}

export async function createNovelChapter(
  id: string,
  payload: {
    title: string;
    order: number;
    content?: string;
    expectation?: string;
    chapterStatus?: ChapterStatus;
    targetWordCount?: number;
    conflictLevel?: number;
    revealLevel?: number;
    mustAvoid?: string;
    taskSheet?: string;
    sceneCards?: string;
    repairHistory?: string;
    qualityScore?: number;
    continuityScore?: number;
    characterScore?: number;
    pacingScore?: number;
    riskFlags?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(`/novels/${id}/chapters`, payload);
  return data;
}

export async function updateNovelChapter(
  id: string,
  chapterId: string,
  payload: Partial<{
    title: string;
    order: number;
    content: string;
    expectation: string;
    chapterStatus: ChapterStatus;
    targetWordCount: number;
    conflictLevel: number;
    revealLevel: number;
    mustAvoid: string;
    taskSheet: string;
    sceneCards: string;
    repairHistory: string;
    qualityScore: number;
    continuityScore: number;
    characterScore: number;
    pacingScore: number;
    riskFlags: string;
    /** false = persist content only; true/omit = also sync artifacts/RAG. */
    syncArtifacts: boolean;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Chapter>>(`/novels/${id}/chapters/${chapterId}`, payload);
  return data;
}

export async function deleteNovelChapter(id: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/chapters/${chapterId}`);
  return data;
}

export async function getChapterTraces(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<import("@ai-novel/shared/types/agent").AgentRun[]>>(
    `/novels/${novelId}/chapters/${chapterId}/traces`,
  );
  return data;
}

export async function getChapterTimeline(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<{
    context: TimelineContextForChapter;
    latestReport: TimelineCheckReport | null;
  }>>(`/novels/${novelId}/chapters/${chapterId}/timeline`);
  return data;
}

export async function previewChapterRewrite(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorRewritePreviewRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorRewritePreviewResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/rewrite-preview`,
    payload,
  );
  return data;
}

export async function getChapterEditorWorkspace(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<ChapterEditorWorkspaceResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/workspace`,
  );
  return data;
}

export async function previewChapterAiRevision(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorAiRevisionRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorAiRevisionResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/ai-revision-preview`,
    payload,
  );
  return data;
}

export async function detectChapterAiWriting(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorAiWritingDetectRequest = {},
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorAiWritingDetectResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/ai-writing-detect`,
    payload,
  );
  return data;
}

export async function generateChapterImageStoryPack(
  novelId: string,
  chapterId: string,
  payload: {
    content?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  } = {},
) {
  const { data } = await apiClient.post<ApiResponse<ChapterImageStoryPack>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/image-story-pack`,
    payload,
  );
  return data;
}

export async function listChapterStyleBenchmarkSources(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<ChapterEditorStyleBenchmarkSourcesResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/style-benchmark/sources`,
  );
  return data;
}

export async function rewriteChapterStyleBenchmark(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorStyleBenchmarkRewriteRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorStyleBenchmarkRewriteResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/style-benchmark/rewrite`,
    payload,
  );
  return data;
}

export async function compareChapterStyleBenchmark(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorStyleBenchmarkCompareRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorStyleBenchmarkCompareResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/style-benchmark/compare`,
    payload,
  );
  return data;
}

export async function getChapterStyleBenchmarkCache(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<ChapterEditorStyleBenchmarkCacheSession | null>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/style-benchmark/cache`,
  );
  return data;
}

export async function saveChapterStyleBenchmarkCache(
  novelId: string,
  chapterId: string,
  session: ChapterEditorStyleBenchmarkCacheSession,
) {
  const { data } = await apiClient.put<ApiResponse<ChapterEditorStyleBenchmarkCacheSession>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/style-benchmark/cache`,
    { session },
  );
  return data;
}

export async function clearChapterStyleBenchmarkCache(novelId: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<{ cleared: boolean }>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/style-benchmark/cache`,
  );
  return data;
}

export async function generateChapterExecutionContract(
  novelId: string,
  chapterId: string,
  payload: Partial<{
    provider: import("@ai-novel/shared/types/llm").LLMProvider;
    model: string;
    temperature: number;
  }> = {},
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(
    `/novels/${novelId}/chapters/${chapterId}/execution-contract`,
    payload,
  );
  return data;
}
