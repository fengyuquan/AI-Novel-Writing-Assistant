/**
 * 漫画项目整包导入/导出：图片文件收集与恢复。
 * 图片按实体 id 落盘；导入时会 remap 到新 id。
 */
import fs from "fs/promises";
import path from "path";
import type { ComicProjectTransferFile } from "@ai-novel/shared/types/comicProjectTransfer";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";

const IMAGE_EXTS = ["png", "jpg", "webp"] as const;

/** 单文件上限 12MB；整包文件总字节上限约 80MB（base64 前） */
export const MAX_SINGLE_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 80 * 1024 * 1024;

type CollectResult = {
  files: ComicProjectTransferFile[];
  totalBytes: number;
  omitted: number;
  warnings: string[];
};

async function readImageIfPresent(
  dir: string,
  basename: string,
): Promise<{ buffer: Buffer; mimeType: string; ext: string } | null> {
  for (const ext of IMAGE_EXTS) {
    const filePath = path.join(dir, `${basename}.${ext}`);
    try {
      const buffer = await fs.readFile(filePath);
      const mimeType =
        ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";
      return { buffer, mimeType, ext };
    } catch {
      /* try next */
    }
  }
  return null;
}

function pushFile(
  state: CollectResult,
  logicalPath: string,
  mimeType: string,
  buffer: Buffer,
): void {
  if (buffer.byteLength > MAX_SINGLE_FILE_BYTES) {
    state.omitted += 1;
    state.warnings.push(`跳过过大文件：${logicalPath}（${buffer.byteLength} 字节）`);
    return;
  }
  if (state.totalBytes + buffer.byteLength > MAX_TOTAL_FILE_BYTES) {
    state.omitted += 1;
    state.warnings.push(`已达整包图片体积上限，后续图片不再打包：${logicalPath}`);
    return;
  }
  state.files.push({
    path: logicalPath,
    mimeType,
    base64: buffer.toString("base64"),
    byteLength: buffer.byteLength,
  });
  state.totalBytes += buffer.byteLength;
}

export async function collectComicProjectFiles(input: {
  characterIds: string[];
  assetIds: string[];
  sceneIds: string[];
  panelIds: string[];
}): Promise<CollectResult> {
  const root = resolveGeneratedImagesRoot();
  const state: CollectResult = { files: [], totalBytes: 0, omitted: 0, warnings: [] };

  for (const charId of input.characterIds) {
    const dir = path.join(root, "comic-characters", charId);
    for (const basename of ["character-sheet", "character-expression"] as const) {
      const hit = await readImageIfPresent(dir, basename);
      if (!hit) continue;
      pushFile(state, `character/${charId}/${basename}.${hit.ext}`, hit.mimeType, hit.buffer);
      if (state.omitted > 0 && state.warnings.at(-1)?.includes("体积上限")) return state;
    }
  }

  for (const assetId of input.assetIds) {
    const dir = path.join(root, "comic-character-assets", assetId);
    const hit = await readImageIfPresent(dir, "asset");
    if (!hit) continue;
    pushFile(state, `asset/${assetId}/asset.${hit.ext}`, hit.mimeType, hit.buffer);
    if (state.omitted > 0 && state.warnings.at(-1)?.includes("体积上限")) return state;
  }

  for (const sceneId of input.sceneIds) {
    const dir = path.join(root, "comic-scenes", sceneId);
    const hit = await readImageIfPresent(dir, "scene-sheet");
    if (!hit) continue;
    pushFile(state, `scene/${sceneId}/scene-sheet.${hit.ext}`, hit.mimeType, hit.buffer);
    if (state.omitted > 0 && state.warnings.at(-1)?.includes("体积上限")) return state;
  }

  for (const panelId of input.panelIds) {
    const panelDir = path.join(root, "comic-panels", panelId);
    const panelHit = await readImageIfPresent(panelDir, "panel");
    if (panelHit) {
      pushFile(state, `panel/${panelId}/panel.${panelHit.ext}`, panelHit.mimeType, panelHit.buffer);
      if (state.omitted > 0 && state.warnings.at(-1)?.includes("体积上限")) return state;
    }
    const letteredDir = path.join(root, "comic-panels-lettered", panelId);
    const letteredHit = await readImageIfPresent(letteredDir, "lettered");
    if (letteredHit) {
      pushFile(
        state,
        `panel-lettered/${panelId}/lettered.${letteredHit.ext}`,
        letteredHit.mimeType,
        letteredHit.buffer,
      );
      if (state.omitted > 0 && state.warnings.at(-1)?.includes("体积上限")) return state;
    }
  }

  return state;
}

function extFromMimeOrPath(mimeType: string, logicalPath: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("png")) return "png";
  const m = logicalPath.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] ?? "png").toLowerCase();
}

function rewriteJsonUrlField(
  raw: string | null | undefined,
  rewrite: (data: Record<string, unknown>) => void,
): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
    const data = parsed as Record<string, unknown>;
    rewrite(data);
    return JSON.stringify(data);
  } catch {
    return raw;
  }
}

export function rewriteCharacterSheetData(raw: string | null, newCharId: string): string | null {
  return rewriteJsonUrlField(raw, (data) => {
    if (data.status === "done") {
      data.url = `/api/comic/character-images/${newCharId}/sheet`;
    }
    // 历史版本图不随整包迁移，避免包体膨胀
    if (Array.isArray(data.history)) data.history = [];
    const assets = data.assets;
    if (assets && typeof assets === "object" && !Array.isArray(assets)) {
      const expression = (assets as Record<string, unknown>).expression;
      if (expression && typeof expression === "object" && !Array.isArray(expression)) {
        const expr = expression as Record<string, unknown>;
        if (expr.status === "done") {
          expr.url = `/api/comic/character-images/${newCharId}/expression`;
        }
        if (Array.isArray(expr.referenceImages)) expr.referenceImages = [];
      }
    }
  });
}

export function rewriteAssetImageData(raw: string | null, newAssetId: string): string | null {
  return rewriteJsonUrlField(raw, (data) => {
    if (data.status === "done") {
      data.url = `/api/comic/character-assets/${newAssetId}/image`;
    }
  });
}

export function rewriteSceneSheetData(raw: string | null, newSceneId: string): string | null {
  return rewriteJsonUrlField(raw, (data) => {
    if (data.status === "done") {
      data.url = `/api/comic/scenes/${newSceneId}/image`;
    }
  });
}

export function rewritePanelImageData(raw: string | null, newPanelId: string): string | null {
  return rewriteJsonUrlField(raw, (data) => {
    if (data.status === "done") {
      data.url = `/api/comic/panel-images/${newPanelId}/panel`;
    }
    // 参考图 URL 指向旧实体，导入后清空，避免误链
    if (Array.isArray(data.referenceImages)) data.referenceImages = [];
    if (Array.isArray(data.history)) data.history = [];
  });
}

export function rewritePanelLetteredData(raw: string | null, newPanelId: string): string | null {
  return rewriteJsonUrlField(raw, (data) => {
    data.url = `/api/comic/panel-images/${newPanelId}/lettered`;
  });
}

export async function restoreComicProjectFiles(input: {
  files: ComicProjectTransferFile[];
  characterIdMap: Map<string, string>;
  assetIdMap: Map<string, string>;
  sceneIdMap: Map<string, string>;
  panelIdMap: Map<string, string>;
}): Promise<{ restored: number; skipped: number }> {
  const root = resolveGeneratedImagesRoot();
  let restored = 0;
  let skipped = 0;

  for (const file of input.files) {
    const buffer = Buffer.from(file.base64, "base64");
    if (!buffer.byteLength) {
      skipped += 1;
      continue;
    }
    const ext = extFromMimeOrPath(file.mimeType, file.path);
    const parts = file.path.split("/");
    try {
      if (parts[0] === "character" && parts.length >= 3) {
        const oldId = parts[1];
        const newId = input.characterIdMap.get(oldId);
        if (!newId) {
          skipped += 1;
          continue;
        }
        const basename = parts[2].replace(/\.[^.]+$/, "");
        const dir = path.join(root, "comic-characters", newId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${basename}.${ext}`), buffer);
        restored += 1;
        continue;
      }
      if (parts[0] === "asset" && parts.length >= 3) {
        const oldId = parts[1];
        const newId = input.assetIdMap.get(oldId);
        if (!newId) {
          skipped += 1;
          continue;
        }
        const dir = path.join(root, "comic-character-assets", newId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `asset.${ext}`), buffer);
        restored += 1;
        continue;
      }
      if (parts[0] === "scene" && parts.length >= 3) {
        const oldId = parts[1];
        const newId = input.sceneIdMap.get(oldId);
        if (!newId) {
          skipped += 1;
          continue;
        }
        const dir = path.join(root, "comic-scenes", newId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `scene-sheet.${ext}`), buffer);
        restored += 1;
        continue;
      }
      if (parts[0] === "panel" && parts.length >= 3) {
        const oldId = parts[1];
        const newId = input.panelIdMap.get(oldId);
        if (!newId) {
          skipped += 1;
          continue;
        }
        const dir = path.join(root, "comic-panels", newId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `panel.${ext}`), buffer);
        restored += 1;
        continue;
      }
      if (parts[0] === "panel-lettered" && parts.length >= 3) {
        const oldId = parts[1];
        const newId = input.panelIdMap.get(oldId);
        if (!newId) {
          skipped += 1;
          continue;
        }
        const dir = path.join(root, "comic-panels-lettered", newId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `lettered.${ext}`), buffer);
        restored += 1;
        continue;
      }
      skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { restored, skipped };
}
