/**
 * 漫画项目整包导出：结构数据 + 可选图片文件。
 */
import {
  COMIC_PROJECT_TRANSFER_KIND,
  COMIC_PROJECT_TRANSFER_SCHEMA_VERSION,
  type ComicProjectTransferPackage,
} from "@ai-novel/shared/types/comicProjectTransfer";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { collectComicProjectFiles } from "./comicProjectTransferFiles";

export interface ExportComicProjectOptions {
  includeImages?: boolean;
}

export async function exportComicProjectPackage(
  projectId: string,
  options: ExportComicProjectOptions = {},
): Promise<ComicProjectTransferPackage> {
  const includeImages = options.includeImages !== false;

  const project = await prisma.comicProject.findUnique({
    where: { id: projectId },
    include: {
      sourceBundle: true,
      characters: { orderBy: { createdAt: "asc" } },
      characterAssets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      scenes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      facts: { orderBy: { createdAt: "asc" } },
      episodes: {
        orderBy: { order: "asc" },
        include: { panels: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!project) {
    throw new AppError("漫画项目不存在。", 404);
  }

  const warnings: string[] = [];
  const panelIds = project.episodes.flatMap((ep) => ep.panels.map((p) => p.id));

  let files: ComicProjectTransferPackage["files"] = [];
  let totalFileBytes = 0;
  let omittedFileCount = 0;

  if (includeImages) {
    const collected = await collectComicProjectFiles({
      characterIds: project.characters.map((c) => c.id),
      assetIds: project.characterAssets.map((a) => a.id),
      sceneIds: project.scenes.map((s) => s.id),
      panelIds,
    });
    files = collected.files;
    totalFileBytes = collected.totalBytes;
    omittedFileCount = collected.omitted;
    warnings.push(...collected.warnings);
  } else {
    warnings.push("本次导出未包含生成图片；导入后需重新出图。");
  }

  warnings.push("批量任务与长图导出任务不会写入备份包。");

  return {
    kind: COMIC_PROJECT_TRANSFER_KIND,
    schemaVersion: COMIC_PROJECT_TRANSFER_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceProjectId: project.id,
    project: {
      title: project.title,
      sourceType: project.sourceType,
      sourceRef: project.sourceRef,
      sourceInput: project.sourceInput,
      trackId: project.trackId,
      stylePreset: project.stylePreset,
      status: project.status,
    },
    sourceBundle: project.sourceBundle
      ? { bundleJson: project.sourceBundle.bundleJson }
      : null,
    characters: project.characters.map((c) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      persona: c.persona,
      visualAnchor: c.visualAnchor,
      sheetData: c.sheetData,
      sourceCharacterRef: c.sourceCharacterRef,
    })),
    characterAssets: project.characterAssets.map((a) => ({
      id: a.id,
      characterId: a.characterId,
      assetType: a.assetType,
      name: a.name,
      description: a.description,
      imageData: a.imageData,
      sortOrder: a.sortOrder,
    })),
    scenes: project.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      sceneType: s.sceneType,
      bible: s.bible,
      sheetData: s.sheetData,
      sortOrder: s.sortOrder,
    })),
    episodes: project.episodes.map((ep) => ({
      id: ep.id,
      order: ep.order,
      title: ep.title,
      hookType: ep.hookType,
      cliffhanger: ep.cliffhanger,
      isPaywalled: ep.isPaywalled,
      outline: ep.outline,
      sourceText: ep.sourceText,
      status: ep.status,
      scriptConfig: ep.scriptConfig,
      panels: ep.panels.map((p) => ({
        id: p.id,
        order: p.order,
        panelType: p.panelType,
        action: p.action,
        dialogues: p.dialogues,
        characterRefs: p.characterRefs,
        sceneRef: p.sceneRef,
        visualPrompt: p.visualPrompt,
        densityLevel: p.densityLevel,
        focus: p.focus,
        layoutData: p.layoutData,
        imageData: p.imageData,
        letteredData: p.letteredData,
        motionData: p.motionData,
      })),
    })),
    facts: project.facts.map((f) => ({
      id: f.id,
      text: f.text,
      category: f.category,
      episodeOrder: f.episodeOrder,
    })),
    files,
    meta: {
      includeImages,
      fileCount: files.length,
      totalFileBytes,
      omittedFileCount,
      warnings,
    },
  };
}

export function buildComicProjectTransferFileName(title: string, exportedAt: string): string {
  const safeTitle = title
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 40) || "comic-project";
  const stamp = exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  return `${safeTitle}_${stamp}.comic.json`;
}
