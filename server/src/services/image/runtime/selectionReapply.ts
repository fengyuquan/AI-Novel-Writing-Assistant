/**
 * 服务端重启后无内存 finalize 时，按 kind + applySnapshot 重新落盘并回写状态。
 */
import fs from "fs/promises";
import path from "path";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import type { PendingImageCandidate, PendingImageSelection } from "./imageSelectionStore";
import type { GeneratedImageState } from "./types";
import { safeJsonParse } from "./utils";

function splitKind(kind: string): { type: string; id: string } {
  const idx = kind.lastIndexOf(":");
  if (idx <= 0 || idx >= kind.length - 1) {
    throw new AppError(`无法解析图像目标 kind：${kind}`, 500);
  }
  return { type: kind.slice(0, idx), id: kind.slice(idx + 1) };
}

async function cleanupOtherExts(dir: string, fileStem: string, keepExt: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const pattern = new RegExp(`^${fileStem}\\.(png|jpg|jpeg|webp)$`, "i");
  for (const name of entries) {
    if (!pattern.test(name)) continue;
    const ext = path.extname(name).replace(".", "").toLowerCase();
    if (ext === keepExt || (keepExt === "jpg" && ext === "jpeg")) continue;
    if (keepExt === "jpeg" && ext === "jpg") continue;
    await fs.unlink(path.join(dir, name)).catch(() => {});
  }
}

async function saveStateByKind(kind: string, state: GeneratedImageState): Promise<void> {
  const { type, id } = splitKind(kind);
  const payload = JSON.stringify(state);
  switch (type) {
    case "comic.panel":
      await prisma.comicPanel.update({ where: { id }, data: { imageData: payload } });
      return;
    case "comic.scene":
      await prisma.comicScene.update({ where: { id }, data: { sheetData: payload } });
      return;
    case "comic.character-asset":
      await prisma.comicCharacterAsset.update({ where: { id }, data: { imageData: payload } });
      return;
    case "comic.character.sheet": {
      const latest = await prisma.comicCharacter.findUnique({ where: { id }, select: { sheetData: true } });
      if (!latest) throw new AppError(`未找到漫画角色：${id}`, 404);
      const sheet = safeJsonParse<Record<string, unknown>>(latest.sheetData, { status: "idle" });
      const merged = {
        ...sheet,
        ...state,
        // 保留表情等嵌套资产，避免改选三视图时冲掉
        assets: sheet.assets,
      };
      await prisma.comicCharacter.update({ where: { id }, data: { sheetData: JSON.stringify(merged) } });
      return;
    }
    case "drama.character.sheet":
      await prisma.dramaCharacter.update({ where: { id }, data: { portraitData: payload } });
      return;
    case "comic.character.expression": {
      const latest = await prisma.comicCharacter.findUnique({ where: { id }, select: { sheetData: true } });
      if (!latest) throw new AppError(`未找到漫画角色：${id}`, 404);
      const sheet = safeJsonParse<Record<string, unknown>>(latest.sheetData, { status: "idle" });
      const assets = (sheet.assets && typeof sheet.assets === "object")
        ? sheet.assets as Record<string, unknown>
        : {};
      const merged = {
        ...sheet,
        status: sheet.status ?? "idle",
        assets: { ...assets, expression: state },
      };
      await prisma.comicCharacter.update({ where: { id }, data: { sheetData: JSON.stringify(merged) } });
      return;
    }
    case "drama.shot.keyframe":
      await prisma.dramaShot.update({ where: { id }, data: { keyframeData: payload } });
      return;
    default:
      throw new AppError(`暂不支持对此类图像改选：${kind}`, 400);
  }
}

export async function applyImageSelectionWithSnapshot<TState = GeneratedImageState>(
  entry: PendingImageSelection,
  candidate: PendingImageCandidate,
  selectionMeta: {
    selectionId: string;
    candidates: Array<{ index: number; url: string }>;
    selectedIndex: number;
  },
): Promise<TState> {
  const snapshot = entry.applySnapshot;
  const destDir = path.join(resolveGeneratedImagesRoot(), snapshot.destRelativeDir);
  const destPath = path.join(destDir, `${snapshot.fileStem}.${candidate.ext}`);
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(candidate.filePath, destPath);
  await cleanupOtherExts(destDir, snapshot.fileStem, candidate.ext);

  const doneState: GeneratedImageState = {
    status: "done",
    version: snapshot.nextVersion,
    url: snapshot.publicUrl,
    prompt: snapshot.prompt,
    provider: snapshot.provider,
    generatedAt: new Date().toISOString(),
    history: snapshot.nextHistory,
    origin: "generated",
    ...(snapshot.referenceImages && snapshot.referenceImages.length > 0
      ? { referenceImages: snapshot.referenceImages }
      : {}),
    selectionId: selectionMeta.selectionId,
    candidates: selectionMeta.candidates,
    selectedIndex: selectionMeta.selectedIndex,
  };

  await saveStateByKind(snapshot.kind, doneState);
  return doneState as TState;
}
