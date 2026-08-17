/**
 * 漫画项目整包导入：始终创建新项目，并 remap 实体 id + 恢复图片。
 */
import {
  COMIC_PROJECT_TRANSFER_KIND,
  COMIC_PROJECT_TRANSFER_SCHEMA_VERSION,
  type ComicProjectTransferImportResult,
  type ComicProjectTransferPackage,
  type ComicProjectTransferPreview,
} from "@ai-novel/shared/types/comicProjectTransfer";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import {
  restoreComicProjectFiles,
  rewriteAssetImageData,
  rewriteCharacterSheetData,
  rewritePanelImageData,
  rewritePanelLetteredData,
  rewriteSceneSheetData,
} from "./comicProjectTransferFiles";

const MAX_TOTAL_ROWS = 5000;
const MAX_EPISODES = 200;
const MAX_PANELS_PER_EPISODE = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseComicProjectTransferPackage(raw: unknown): ComicProjectTransferPackage {
  if (!isPlainObject(raw)) {
    throw new AppError("导入体必须是漫画项目备份 JSON 对象。", 400);
  }
  if (raw.kind !== COMIC_PROJECT_TRANSFER_KIND) {
    throw new AppError(`不是漫画项目备份包（期望 kind=${COMIC_PROJECT_TRANSFER_KIND}）。`, 400);
  }
  const schemaVersion = asNumber(raw.schemaVersion, 0);
  if (schemaVersion !== COMIC_PROJECT_TRANSFER_SCHEMA_VERSION) {
    throw new AppError(
      `不支持的备份版本 schemaVersion=${schemaVersion}，当前仅支持 ${COMIC_PROJECT_TRANSFER_SCHEMA_VERSION}。`,
      400,
    );
  }
  if (!isPlainObject(raw.project) || !asString(raw.project.title).trim()) {
    throw new AppError("备份包缺少有效的 project.title。", 400);
  }
  if (!Array.isArray(raw.characters) || !Array.isArray(raw.episodes) || !Array.isArray(raw.scenes)) {
    throw new AppError("备份包缺少 characters / scenes / episodes 数组。", 400);
  }

  const files = Array.isArray(raw.files)
    ? raw.files
        .filter(isPlainObject)
        .map((f) => ({
          path: asString(f.path),
          mimeType: asString(f.mimeType, "image/png"),
          base64: asString(f.base64),
          byteLength: asNumber(f.byteLength, 0),
        }))
        .filter((f) => f.path && f.base64)
    : [];

  const metaRaw = isPlainObject(raw.meta) ? raw.meta : {};
  const episodes = (raw.episodes as unknown[]).filter(isPlainObject).map((ep) => {
    const panels = Array.isArray(ep.panels)
      ? (ep.panels as unknown[]).filter(isPlainObject).map((p) => ({
          id: asString(p.id),
          order: asNumber(p.order, 1),
          panelType: asNullableString(p.panelType),
          action: asString(p.action),
          dialogues: asNullableString(p.dialogues),
          characterRefs: asNullableString(p.characterRefs),
          sceneRef: asNullableString(p.sceneRef),
          visualPrompt: asNullableString(p.visualPrompt),
          densityLevel: asNullableString(p.densityLevel),
          focus: asNullableString(p.focus),
          layoutData: asNullableString(p.layoutData),
          imageData: asNullableString(p.imageData),
          letteredData: asNullableString(p.letteredData),
          motionData: asNullableString(p.motionData),
        }))
      : [];
    return {
      id: asString(ep.id),
      order: asNumber(ep.order, 1),
      title: asNullableString(ep.title),
      hookType: asNullableString(ep.hookType),
      cliffhanger: asNullableString(ep.cliffhanger),
      isPaywalled: asBoolean(ep.isPaywalled, false),
      outline: asNullableString(ep.outline),
      sourceText: asNullableString(ep.sourceText),
      status: asString(ep.status, "draft"),
      scriptConfig: asNullableString(ep.scriptConfig),
      panels,
    };
  });

  return {
    kind: COMIC_PROJECT_TRANSFER_KIND,
    schemaVersion: COMIC_PROJECT_TRANSFER_SCHEMA_VERSION,
    exportedAt: asString(raw.exportedAt, new Date().toISOString()),
    sourceProjectId: asString(raw.sourceProjectId),
    project: {
      title: asString(raw.project.title).trim(),
      sourceType: asString(raw.project.sourceType, "original"),
      sourceRef: asNullableString(raw.project.sourceRef),
      sourceInput: asNullableString(raw.project.sourceInput),
      trackId: asNullableString(raw.project.trackId),
      stylePreset: asNullableString(raw.project.stylePreset),
      status: asString(raw.project.status, "draft"),
    },
    sourceBundle:
      isPlainObject(raw.sourceBundle) && typeof raw.sourceBundle.bundleJson === "string"
        ? { bundleJson: raw.sourceBundle.bundleJson }
        : null,
    characters: (raw.characters as unknown[]).filter(isPlainObject).map((c) => ({
      id: asString(c.id),
      name: asString(c.name),
      gender: asString(c.gender, "unknown"),
      persona: asNullableString(c.persona),
      visualAnchor: asNullableString(c.visualAnchor),
      sheetData: asNullableString(c.sheetData),
      sourceCharacterRef: asNullableString(c.sourceCharacterRef),
    })),
    characterAssets: Array.isArray(raw.characterAssets)
      ? (raw.characterAssets as unknown[]).filter(isPlainObject).map((a) => ({
          id: asString(a.id),
          characterId: asString(a.characterId),
          assetType: asString(a.assetType, "other"),
          name: asString(a.name),
          description: asNullableString(a.description),
          imageData: asNullableString(a.imageData),
          sortOrder: asNumber(a.sortOrder, 0),
        }))
      : [],
    scenes: (raw.scenes as unknown[]).filter(isPlainObject).map((s) => ({
      id: asString(s.id),
      name: asString(s.name),
      sceneType: asString(s.sceneType, "interior"),
      bible: asNullableString(s.bible),
      sheetData: asNullableString(s.sheetData),
      sortOrder: asNumber(s.sortOrder, 0),
    })),
    episodes,
    facts: Array.isArray(raw.facts)
      ? (raw.facts as unknown[]).filter(isPlainObject).map((f) => ({
          id: asString(f.id),
          text: asString(f.text),
          category: asString(f.category, "completed"),
          episodeOrder:
            f.episodeOrder === null || f.episodeOrder === undefined
              ? null
              : asNumber(f.episodeOrder),
        }))
      : [],
    files,
    meta: {
      includeImages: asBoolean(metaRaw.includeImages, files.length > 0),
      fileCount: asNumber(metaRaw.fileCount, files.length),
      totalFileBytes: asNumber(metaRaw.totalFileBytes, 0),
      omittedFileCount: asNumber(metaRaw.omittedFileCount, 0),
      warnings: Array.isArray(metaRaw.warnings)
        ? metaRaw.warnings.filter((w): w is string => typeof w === "string")
        : [],
    },
  };
}

export function buildComicProjectTransferPreview(
  pkg: ComicProjectTransferPackage,
): ComicProjectTransferPreview {
  const panelCount = pkg.episodes.reduce((sum, ep) => sum + ep.panels.length, 0);
  const rowEstimate =
    1 +
    (pkg.sourceBundle ? 1 : 0) +
    pkg.characters.length +
    pkg.characterAssets.length +
    pkg.scenes.length +
    pkg.episodes.length +
    panelCount +
    pkg.facts.length;

  const warnings = [...pkg.meta.warnings];
  if (pkg.episodes.length > MAX_EPISODES) {
    warnings.push(`话数过多（${pkg.episodes.length}），超过上限 ${MAX_EPISODES}。`);
  }
  if (pkg.episodes.some((ep) => ep.panels.length > MAX_PANELS_PER_EPISODE)) {
    warnings.push(`存在单话格子数超过上限 ${MAX_PANELS_PER_EPISODE}。`);
  }
  if (rowEstimate > MAX_TOTAL_ROWS) {
    warnings.push(`总行数估算 ${rowEstimate} 超过上限 ${MAX_TOTAL_ROWS}。`);
  }
  if (pkg.files.length === 0) {
    warnings.push("备份包未包含图片文件，导入后需重新生成画面。");
  }

  const canImport =
    pkg.project.title.trim().length > 0 &&
    pkg.episodes.length <= MAX_EPISODES &&
    pkg.episodes.every((ep) => ep.panels.length <= MAX_PANELS_PER_EPISODE) &&
    rowEstimate <= MAX_TOTAL_ROWS;

  return {
    schemaVersion: pkg.schemaVersion,
    exportedAt: pkg.exportedAt,
    sourceProjectId: pkg.sourceProjectId || null,
    title: pkg.project.title,
    sourceType: pkg.project.sourceType,
    counts: {
      characters: pkg.characters.length,
      characterAssets: pkg.characterAssets.length,
      scenes: pkg.scenes.length,
      episodes: pkg.episodes.length,
      panels: panelCount,
      facts: pkg.facts.length,
      files: pkg.files.length,
    },
    includeImages: pkg.meta.includeImages,
    warnings,
    canImport,
  };
}

export async function previewComicProjectImport(
  raw: unknown,
): Promise<ComicProjectTransferPreview> {
  const pkg = parseComicProjectTransferPackage(raw);
  return buildComicProjectTransferPreview(pkg);
}

export async function importComicProjectPackage(
  raw: unknown,
  options?: { titleOverride?: string },
): Promise<ComicProjectTransferImportResult> {
  const pkg = parseComicProjectTransferPackage(raw);
  const preview = buildComicProjectTransferPreview(pkg);
  if (!preview.canImport) {
    throw new AppError(preview.warnings.join(" ") || "备份包无法导入。", 400);
  }

  const title = (options?.titleOverride?.trim() || pkg.project.title).slice(0, 120);
  const characterIdMap = new Map<string, string>();
  const assetIdMap = new Map<string, string>();
  const sceneIdMap = new Map<string, string>();
  const panelIdMap = new Map<string, string>();

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.comicProject.create({
      data: {
        title,
        sourceType: pkg.project.sourceType || "original",
        sourceRef: pkg.project.sourceRef,
        sourceInput: pkg.project.sourceInput,
        trackId: pkg.project.trackId,
        stylePreset: pkg.project.stylePreset,
        status: pkg.project.status || "draft",
      },
    });

    if (pkg.sourceBundle) {
      await tx.comicSourceBundle.create({
        data: {
          projectId: project.id,
          bundleJson: pkg.sourceBundle.bundleJson,
        },
      });
    }

    for (const character of pkg.characters) {
      const row = await tx.comicCharacter.create({
        data: {
          projectId: project.id,
          name: character.name || "未命名角色",
          gender: character.gender || "unknown",
          persona: character.persona,
          visualAnchor: character.visualAnchor,
          // 先占位，写入新 id 后再改写 url
          sheetData: null,
          sourceCharacterRef: character.sourceCharacterRef,
        },
      });
      if (character.id) characterIdMap.set(character.id, row.id);
      const sheetData = rewriteCharacterSheetData(character.sheetData, row.id);
      if (sheetData) {
        await tx.comicCharacter.update({
          where: { id: row.id },
          data: { sheetData },
        });
      }
    }

    for (const asset of pkg.characterAssets) {
      const newCharacterId = characterIdMap.get(asset.characterId);
      if (!newCharacterId) continue;
      const row = await tx.comicCharacterAsset.create({
        data: {
          projectId: project.id,
          characterId: newCharacterId,
          assetType: asset.assetType || "other",
          name: asset.name || "未命名资产",
          description: asset.description,
          imageData: null,
          sortOrder: asset.sortOrder,
        },
      });
      if (asset.id) assetIdMap.set(asset.id, row.id);
      const imageData = rewriteAssetImageData(asset.imageData, row.id);
      if (imageData) {
        await tx.comicCharacterAsset.update({
          where: { id: row.id },
          data: { imageData },
        });
      }
    }

    for (const scene of pkg.scenes) {
      const row = await tx.comicScene.create({
        data: {
          projectId: project.id,
          name: scene.name || "未命名场景",
          sceneType: scene.sceneType || "interior",
          bible: scene.bible,
          sheetData: null,
          sortOrder: scene.sortOrder,
        },
      });
      if (scene.id) sceneIdMap.set(scene.id, row.id);
      const sheetData = rewriteSceneSheetData(scene.sheetData, row.id);
      if (sheetData) {
        await tx.comicScene.update({
          where: { id: row.id },
          data: { sheetData },
        });
      }
    }

    for (const episode of pkg.episodes) {
      const epRow = await tx.comicEpisode.create({
        data: {
          projectId: project.id,
          order: episode.order,
          title: episode.title,
          hookType: episode.hookType,
          cliffhanger: episode.cliffhanger,
          isPaywalled: episode.isPaywalled,
          outline: episode.outline,
          sourceText: episode.sourceText,
          status: episode.status || "draft",
          scriptConfig: episode.scriptConfig,
        },
      });

      for (const panel of episode.panels) {
        const panelRow = await tx.comicPanel.create({
          data: {
            episodeId: epRow.id,
            order: panel.order,
            panelType: panel.panelType,
            action: panel.action || "",
            dialogues: panel.dialogues,
            characterRefs: panel.characterRefs,
            sceneRef: panel.sceneRef,
            visualPrompt: panel.visualPrompt,
            densityLevel: panel.densityLevel,
            focus: panel.focus,
            layoutData: panel.layoutData,
            imageData: null,
            letteredData: null,
            motionData: panel.motionData,
          },
        });
        if (panel.id) panelIdMap.set(panel.id, panelRow.id);
        const imageData = rewritePanelImageData(panel.imageData, panelRow.id);
        const letteredData = rewritePanelLetteredData(panel.letteredData, panelRow.id);
        if (imageData || letteredData) {
          await tx.comicPanel.update({
            where: { id: panelRow.id },
            data: {
              ...(imageData ? { imageData } : {}),
              ...(letteredData ? { letteredData } : {}),
            },
          });
        }
      }
    }

    if (pkg.facts.length > 0) {
      await tx.comicFact.createMany({
        data: pkg.facts
          .filter((f) => f.text.trim())
          .map((f) => ({
            projectId: project.id,
            text: f.text,
            category: f.category || "completed",
            episodeOrder: f.episodeOrder,
          })),
      });
    }

    return project;
  });

  const fileResult = await restoreComicProjectFiles({
    files: pkg.files,
    characterIdMap,
    assetIdMap,
    sceneIdMap,
    panelIdMap,
  });

  return {
    projectId: created.id,
    title: created.title,
    preview,
    restoredFiles: fileResult.restored,
    skippedFiles: fileResult.skipped,
  };
}
