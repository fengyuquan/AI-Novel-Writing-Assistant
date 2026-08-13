import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface ImageCandidateItem {
  index: number;
  url: string;
}

/** 上游返回多张图时的选择态响应 */
export interface ImageSelectionPendingPayload {
  status: "awaiting_selection";
  selectionId: string;
  candidates: ImageCandidateItem[];
  selectedIndex?: number;
  version?: number;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

/** 已落盘但仍保留候选，可改选 */
export interface ImageSelectionCachedPayload {
  selectionId: string;
  candidates: ImageCandidateItem[];
  selectedIndex?: number;
}

export function isImageSelectionPending(value: unknown): value is ImageSelectionPendingPayload {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    data.status === "awaiting_selection"
    && typeof data.selectionId === "string"
    && Array.isArray(data.candidates)
    && data.candidates.length > 0
  );
}

export function getCachedImageSelection(value: unknown): ImageSelectionCachedPayload | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.selectionId !== "string" || !data.selectionId) return null;
  if (!Array.isArray(data.candidates) || data.candidates.length < 2) return null;
  const candidates = data.candidates.filter((item): item is ImageCandidateItem => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.index === "number" && typeof row.url === "string";
  });
  if (candidates.length < 2) return null;
  return {
    selectionId: data.selectionId,
    candidates,
    selectedIndex: typeof data.selectedIndex === "number" ? data.selectedIndex : undefined,
  };
}

export async function applyImageSelection(selectionId: string, index: number): Promise<unknown> {
  const res = await apiClient.post<ApiResponse<unknown>>(
    `/image-runtime/selections/${selectionId}/apply`,
    { index },
  );
  return res.data.data;
}

export async function getImageSelection(selectionId: string): Promise<ImageSelectionCachedPayload & { expiresAt: number; kind: string }> {
  const res = await apiClient.get<ApiResponse<{
    selectionId: string;
    kind: string;
    selectedIndex?: number;
    candidates: ImageCandidateItem[];
    expiresAt: number;
  }>>(`/image-runtime/selections/${selectionId}`);
  return res.data.data!;
}
