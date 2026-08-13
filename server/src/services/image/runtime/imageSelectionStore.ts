/**
 * 多图候选磁盘持久化 + 内存 finalize。
 * apply 后保留候选文件，便于改选；服务端重启后仍可读图，并可用 snapshot 重新落盘。
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";

import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import type { GeneratedImageHistoryItem, GeneratedReferenceImageMeta } from "./types";

/** 候选保留 7 天，方便改选 */
const SELECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SELECTION_DIR = "_image-selections";

export interface PendingImageCandidate {
  index: number;
  filePath: string;
  ext: string;
}

export interface ImageSelectionApplySnapshot {
  kind: string;
  publicUrl: string;
  /** 相对 generated-images 根目录 */
  destRelativeDir: string;
  fileStem: string;
  provider: string;
  prompt: string;
  nextVersion: number;
  nextHistory: GeneratedImageHistoryItem[];
  referenceImages?: GeneratedReferenceImageMeta[];
}

export interface ImageSelectionDiskMeta {
  id: string;
  kind: string;
  createdAt: number;
  expiresAt: number;
  selectedIndex?: number;
  candidates: Array<{ index: number; ext: string }>;
  applySnapshot: ImageSelectionApplySnapshot;
}

export interface PendingImageSelection<TState = unknown> {
  id: string;
  createdAt: number;
  expiresAt: number;
  kind: string;
  candidates: PendingImageCandidate[];
  selectedIndex?: number;
  applySnapshot: ImageSelectionApplySnapshot;
  finalize: (selected: PendingImageCandidate) => Promise<TState>;
}

const pending = new Map<string, PendingImageSelection>();

function selectionRoot(id: string): string {
  return path.join(resolveGeneratedImagesRoot(), SELECTION_DIR, id);
}

function metaPath(id: string): string {
  return path.join(selectionRoot(id), "meta.json");
}

function candidatePublicUrl(selectionId: string, index: number): string {
  return `/api/image-runtime/selections/${selectionId}/candidates/${index}`;
}

function mimeForExt(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

async function writeMeta(meta: ImageSelectionDiskMeta): Promise<void> {
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

async function readMeta(selectionId: string): Promise<ImageSelectionDiskMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(selectionId), "utf8");
    return JSON.parse(raw) as ImageSelectionDiskMeta;
  } catch {
    return null;
  }
}

export function pruneExpiredImageSelections(now = Date.now()): void {
  for (const [id, entry] of pending) {
    if (entry.expiresAt <= now) {
      pending.delete(id);
      void fs.rm(selectionRoot(id), { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function hydrateFromDisk(selectionId: string): Promise<PendingImageSelection | null> {
  const meta = await readMeta(selectionId);
  if (!meta) return null;
  if (meta.expiresAt <= Date.now()) {
    void fs.rm(selectionRoot(selectionId), { recursive: true, force: true }).catch(() => {});
    return null;
  }
  const candidates: PendingImageCandidate[] = meta.candidates.map((item) => ({
    index: item.index,
    ext: item.ext,
    filePath: path.join(selectionRoot(selectionId), `${item.index}.${item.ext}`),
  }));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate.filePath);
    } catch {
      return null;
    }
  }
  const entry: PendingImageSelection = {
    id: meta.id,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    kind: meta.kind,
    candidates,
    selectedIndex: meta.selectedIndex,
    applySnapshot: meta.applySnapshot,
    finalize: async () => {
      throw new AppError("INTERNAL_NEEDS_SNAPSHOT_APPLY", 500);
    },
  };
  pending.set(selectionId, entry);
  return entry;
}

export async function createPendingImageSelection<TState>(input: {
  kind: string;
  candidateUrls: string[];
  applySnapshot: ImageSelectionApplySnapshot;
  finalize: (selected: PendingImageCandidate) => Promise<TState>;
  saveImage: (imageUrl: string, destPath: string) => Promise<void>;
  inferExtension: (imageUrl: string) => string;
}): Promise<{ selectionId: string; candidates: Array<{ index: number; url: string }> }> {
  pruneExpiredImageSelections();
  if (input.candidateUrls.length < 2) {
    throw new AppError("候选图少于 2 张，无需进入选择流程。", 400);
  }

  const id = randomUUID();
  const dir = selectionRoot(id);
  await fs.mkdir(dir, { recursive: true });

  const candidates: PendingImageCandidate[] = [];
  for (let index = 0; index < input.candidateUrls.length; index += 1) {
    const imageUrl = input.candidateUrls[index];
    const ext = input.inferExtension(imageUrl) || "png";
    const filePath = path.join(dir, `${index}.${ext}`);
    await input.saveImage(imageUrl, filePath);
    candidates.push({ index, filePath, ext });
  }

  const now = Date.now();
  const expiresAt = now + SELECTION_TTL_MS;
  const meta: ImageSelectionDiskMeta = {
    id,
    kind: input.kind,
    createdAt: now,
    expiresAt,
    candidates: candidates.map((item) => ({ index: item.index, ext: item.ext })),
    applySnapshot: input.applySnapshot,
  };
  await writeMeta(meta);

  pending.set(id, {
    id,
    createdAt: now,
    expiresAt,
    kind: input.kind,
    candidates,
    applySnapshot: input.applySnapshot,
    finalize: input.finalize,
  });

  return {
    selectionId: id,
    candidates: candidates.map((item) => ({
      index: item.index,
      url: candidatePublicUrl(id, item.index),
    })),
  };
}

export async function getPendingImageSelection(selectionId: string): Promise<PendingImageSelection> {
  pruneExpiredImageSelections();
  const cached = pending.get(selectionId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const hydrated = await hydrateFromDisk(selectionId);
  if (!hydrated) {
    throw new AppError("候选图已过期或不存在，请重新生成。", 404);
  }
  return hydrated;
}

export async function getImageSelectionInfo(selectionId: string): Promise<{
  selectionId: string;
  kind: string;
  selectedIndex?: number;
  candidates: Array<{ index: number; url: string }>;
  expiresAt: number;
}> {
  const entry = await getPendingImageSelection(selectionId);
  return {
    selectionId: entry.id,
    kind: entry.kind,
    selectedIndex: entry.selectedIndex,
    expiresAt: entry.expiresAt,
    candidates: entry.candidates.map((item) => ({
      index: item.index,
      url: candidatePublicUrl(entry.id, item.index),
    })),
  };
}

export async function readPendingCandidateFile(
  selectionId: string,
  index: number,
): Promise<{ filePath: string; mimeType: string }> {
  const entry = await getPendingImageSelection(selectionId);
  const candidate = entry.candidates.find((item) => item.index === index);
  if (!candidate) {
    throw new AppError("候选图序号无效。", 404);
  }
  await fs.access(candidate.filePath);
  return { filePath: candidate.filePath, mimeType: mimeForExt(candidate.ext) };
}

export async function markSelectionApplied(selectionId: string, index: number): Promise<void> {
  const entry = await getPendingImageSelection(selectionId);
  entry.selectedIndex = index;
  entry.expiresAt = Date.now() + SELECTION_TTL_MS;
  pending.set(selectionId, entry);
  await writeMeta({
    id: entry.id,
    kind: entry.kind,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    selectedIndex: index,
    candidates: entry.candidates.map((item) => ({ index: item.index, ext: item.ext })),
    applySnapshot: entry.applySnapshot,
  });
}

export async function applyPendingImageSelection<TState>(
  selectionId: string,
  index: number,
  applyWithSnapshot: (
    entry: PendingImageSelection,
    candidate: PendingImageCandidate,
  ) => Promise<TState>,
): Promise<TState> {
  const entry = await getPendingImageSelection(selectionId);
  const candidate = entry.candidates.find((item) => item.index === index);
  if (!candidate) {
    throw new AppError("候选图序号无效。", 400);
  }

  let state: TState;
  try {
    state = await entry.finalize(candidate) as TState;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsSnapshot = message.includes("INTERNAL_NEEDS_SNAPSHOT_APPLY");
    if (!needsSnapshot) throw error;
    state = await applyWithSnapshot(entry, candidate);
  }

  await markSelectionApplied(selectionId, index);
  return state;
}
