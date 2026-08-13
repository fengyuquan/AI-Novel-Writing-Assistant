/**
 * 图像生成 runner：执行"业务表 JSON 状态机 + 落盘"的唯一流程入口。
 *
 * 由 Adapter 适配各业务表的字段读写；本文件不感知具体业务模型。
 *
 * 流程：
 *   provider 解析/校验 → model 解析 → loadState → 归档历史/递增 version
 *   → save generating → generateImagesByProvider
 *   → 单图：落盘 → cleanupOtherExts → save done
 *   → 多图：暂存候选 → save awaiting_selection → 返回 selection_required
 *   catch → save error
 */
import fs from "fs/promises";
import path from "path";

import { AppError } from "../../../middleware/errorHandler";
import {
  generateImagesByProvider,
  isImageProviderSupported,
  resolveImageModel,
} from "../provider";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getImageSelectionSettings } from "../../settings/ImageSelectionSettingsService";

import {
  applyPendingImageSelection,
  createPendingImageSelection,
} from "./imageSelectionStore";
import { applyImageSelectionWithSnapshot } from "./selectionReapply";
import {
  DEFAULT_RUNTIME_PROVIDER,
  DEFAULT_RUNTIME_SIZE,
  type GeneratedImageHistoryItem,
  type GeneratedImageState,
  type ImageSelectionRequired,
  type ImageTargetAdapter,
  type RunImageGenerationOptions,
  type RunImageGenerationResult,
} from "./types";
import { describeError, inferExtension, saveImageToDisk } from "./utils";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";

const DEFAULT_HISTORY_MAX = 5;

export async function resolveRequestImageModel(
  provider: LLMProvider,
  explicitModel?: string,
): Promise<string> {
  if (explicitModel?.trim()) {
    return resolveImageModel(provider, explicitModel);
  }
  const selection = await getImageSelectionSettings();
  if (selection?.provider === provider && selection.model) {
    return resolveImageModel(provider, selection.model);
  }
  return resolveImageModel(provider);
}

/** 默认归档当前 done 状态为历史条目 */
function defaultArchive<TState extends GeneratedImageState>(current: TState): GeneratedImageHistoryItem | null {
  if (current.status !== "done") return null;
  return {
    version: current.version ?? 1,
    url: current.url,
    prompt: current.prompt,
    provider: current.provider,
    generatedAt: current.generatedAt,
  };
}

/** 计算下一版本号 */
function readVersion(state: GeneratedImageState): number {
  const v = Number(state.version);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  return state.status === "done" ? 1 : 0;
}

async function finalizeSelectedImage<TState extends GeneratedImageState>(input: {
  adapter: ImageTargetAdapter<TState>;
  existing: TState;
  provider: LLMProvider;
  prompt: string;
  nextVersion: number;
  nextHistory: GeneratedImageHistoryItem[];
  referenceImages?: RunImageGenerationOptions["referenceImages"];
  selectedFilePath: string;
  selectedExt: string;
  selectionId: string;
  candidates: Array<{ index: number; url: string }>;
  selectedIndex: number;
}): Promise<TState> {
  const destPath = input.adapter.diskPath(input.selectedExt);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(input.selectedFilePath, destPath);
  if (input.adapter.cleanupOtherExts) await input.adapter.cleanupOtherExts(input.selectedExt);

  const doneBase: GeneratedImageState = {
    status: "done",
    version: input.nextVersion,
    url: input.adapter.publicUrl(),
    prompt: input.prompt,
    provider: input.provider,
    generatedAt: new Date().toISOString(),
    history: input.nextHistory,
    origin: "generated",
    ...(input.referenceImages && input.referenceImages.length > 0
      ? { referenceImages: input.referenceImages }
      : {}),
    selectionId: input.selectionId,
    candidates: input.candidates,
    selectedIndex: input.selectedIndex,
  };
  const extraDone = input.adapter.buildExtraDoneState
    ? input.adapter.buildExtraDoneState(doneBase)
    : ({} as Partial<TState>);
  const doneState = {
    ...input.existing,
    ...doneBase,
    ...extraDone,
    error: undefined,
  } as TState;
  await input.adapter.saveState(doneState);
  return doneState;
}

function buildApplySnapshot<TState extends GeneratedImageState>(
  adapter: ImageTargetAdapter<TState>,
  input: {
    provider: string;
    prompt: string;
    nextVersion: number;
    nextHistory: GeneratedImageHistoryItem[];
    referenceImages?: RunImageGenerationOptions["referenceImages"];
  },
) {
  const samplePath = adapter.diskPath("png");
  const destDir = path.dirname(samplePath);
  const fileStem = path.basename(samplePath, ".png");
  const destRelativeDir = path.relative(resolveGeneratedImagesRoot(), destDir);
  return {
    kind: adapter.kind,
    publicUrl: adapter.publicUrl(),
    destRelativeDir,
    fileStem,
    provider: input.provider,
    prompt: input.prompt,
    nextVersion: input.nextVersion,
    nextHistory: input.nextHistory,
    referenceImages: input.referenceImages,
  };
}

export async function runImageGeneration<TState extends GeneratedImageState>(
  adapter: ImageTargetAdapter<TState>,
  opts: RunImageGenerationOptions,
): Promise<RunImageGenerationResult<TState>> {
  const provider = (opts.provider as LLMProvider | undefined) ?? DEFAULT_RUNTIME_PROVIDER;
  if (!isImageProviderSupported(provider)) {
    throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
  }

  const model = await resolveRequestImageModel(provider, opts.model);

  const existing = await adapter.loadState();
  const versioning = adapter.versioning ?? { enabled: false };
  const archiver = versioning.archiveCurrent ?? defaultArchive;
  const archived = versioning.enabled ? await archiver(existing) : null;
  const prevHistory: GeneratedImageHistoryItem[] = Array.isArray(existing.history) ? existing.history : [];
  const nextHistory = (archived ? [...prevHistory, archived] : prevHistory).slice(-(versioning.maxHistory ?? DEFAULT_HISTORY_MAX));
  const nextVersion = existing.status === "done"
    ? readVersion(existing) + 1
    : Math.max(1, readVersion(existing) || 1);

  const generatingState = {
    ...existing,
    status: "generating",
    provider,
    version: nextVersion,
    history: nextHistory,
    error: undefined,
    selectionId: undefined,
    candidates: undefined,
    selectedIndex: undefined,
  } as TState;
  await adapter.saveState(generatingState);

  try {
    const result = await generateImagesByProvider({
      sceneType: opts.sceneType ?? "chapter_illustration",
      provider,
      model,
      prompt: opts.prompt,
      ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      size: opts.size ?? DEFAULT_RUNTIME_SIZE,
      count: opts.count ?? 1,
      ...(opts.refImagePaths && opts.refImagePaths.length > 0 ? { refImagePaths: opts.refImagePaths } : {}),
      ...(opts.refImages && opts.refImages.length > 0 ? { refImages: opts.refImages } : {}),
    });

    const images = (result.images ?? []).filter((item) => Boolean(item?.url));
    if (images.length === 0) throw new Error("图片生成结果为空");

    if (images.length === 1) {
      const imageUrl = images[0].url;
      const ext = inferExtension(imageUrl);
      const destPath = adapter.diskPath(ext);
      await saveImageToDisk(imageUrl, destPath);
      if (adapter.cleanupOtherExts) await adapter.cleanupOtherExts(ext);

      console.log(`[image.runtime] done kind=${adapter.kind} provider=${provider} model=${model} -> ${path.basename(destPath)}`);

      const doneBase: GeneratedImageState = {
        status: "done",
        version: nextVersion,
        url: adapter.publicUrl(),
        prompt: opts.prompt,
        provider,
        generatedAt: new Date().toISOString(),
        history: nextHistory,
        origin: "generated",
        ...(opts.referenceImages && opts.referenceImages.length > 0 ? { referenceImages: opts.referenceImages } : {}),
      };
      const extraDone = adapter.buildExtraDoneState ? adapter.buildExtraDoneState(doneBase) : ({} as Partial<TState>);
      const doneState = {
        ...existing,
        ...doneBase,
        ...extraDone,
        selectionId: undefined,
        candidates: undefined,
        selectedIndex: undefined,
        error: undefined,
      } as TState;
      await adapter.saveState(doneState);
      return doneState;
    }

    const pendingRef: {
      selectionId: string;
      candidates: Array<{ index: number; url: string }>;
    } = { selectionId: "", candidates: [] };

    const applySnapshot = buildApplySnapshot(adapter, {
      provider,
      prompt: opts.prompt,
      nextVersion,
      nextHistory,
      referenceImages: opts.referenceImages,
    });

    const pending = await createPendingImageSelection({
      kind: adapter.kind,
      candidateUrls: images.map((item) => item.url),
      applySnapshot,
      saveImage: saveImageToDisk,
      inferExtension,
      finalize: async (selected) => finalizeSelectedImage({
        adapter,
        existing,
        provider,
        prompt: opts.prompt,
        nextVersion,
        nextHistory,
        referenceImages: opts.referenceImages,
        selectedFilePath: selected.filePath,
        selectedExt: selected.ext,
        selectionId: pendingRef.selectionId,
        candidates: pendingRef.candidates,
        selectedIndex: selected.index,
      }),
    });
    pendingRef.selectionId = pending.selectionId;
    pendingRef.candidates = pending.candidates;

    const awaitingBase: GeneratedImageState = {
      status: "awaiting_selection",
      version: nextVersion,
      prompt: opts.prompt,
      provider,
      model,
      generatedAt: new Date().toISOString(),
      history: nextHistory,
      ...(opts.referenceImages && opts.referenceImages.length > 0 ? { referenceImages: opts.referenceImages } : {}),
    };
    const awaitingState = {
      ...existing,
      ...awaitingBase,
      selectionId: pending.selectionId,
      candidates: pending.candidates,
      selectedIndex: undefined,
    } as TState;
    await adapter.saveState(awaitingState);

    console.log(`[image.runtime] selection_required kind=${adapter.kind} count=${pending.candidates.length} selectionId=${pending.selectionId}`);

    const payload: ImageSelectionRequired<TState> = {
      __imageSelectionRequired: true,
      selectionId: pending.selectionId,
      candidates: pending.candidates,
      state: awaitingState,
    };
    return payload;
  } catch (err) {
    const errMsg = describeError(err);
    console.error(`[image.runtime] error kind=${adapter.kind} provider=${provider}:`, errMsg);
    const errorState = {
      ...existing,
      status: "error",
      provider,
      version: nextVersion,
      error: errMsg,
      history: nextHistory,
    } as TState;
    await adapter.saveState(errorState);
    throw err;
  }
}

export async function applyImageGenerationSelection<TState = GeneratedImageState>(
  selectionId: string,
  index: number,
): Promise<TState> {
  return applyPendingImageSelection<TState>(selectionId, index, async (entry, candidate) => {
    const candidates = entry.candidates.map((item) => ({
      index: item.index,
      url: `/api/image-runtime/selections/${entry.id}/candidates/${item.index}`,
    }));
    return applyImageSelectionWithSnapshot<TState>(entry, candidate, {
      selectionId: entry.id,
      candidates,
      selectedIndex: index,
    });
  });
}
