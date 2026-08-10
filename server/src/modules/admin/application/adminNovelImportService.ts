import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { isWriteAllowed, toPrismaClientKey } from "../domain/adminPolicy";
import { appendAdminAudit } from "../infrastructure/adminAuditStore";
import { createAdminRecord, updateAdminRecord } from "./adminCrudService";
import { getAdminModelMeta, listAdminModels } from "./adminMetaService";
import type { NovelExportSlice } from "./adminNovelExportService";

/** Content-oriented models safe to import by default. Tasks/runtime stay out. */
export const IMPORTABLE_CONTENT_MODELS = [
  "Chapter",
  "Character",
  "NovelBible",
  "VolumePlan",
  "PlotBeat",
  "BookContract",
  "ChapterSummary",
  "StoryMacroPlan",
  "StorylineVersion",
] as const;

const IMPORT_TYPED_CONFIRM = "IMPORT";
const MAX_TOTAL_ROWS = 2000;

type FindUniqueDelegate = {
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
};

export interface ImportModelPlan {
  model: string;
  create: number;
  update: number;
  skipConflict: number;
  skipReadonly: number;
  skipInvalid: number;
  truncatedInSlice: boolean;
  sampleCreateIds: string[];
  sampleUpdateIds: string[];
  sampleConflictIds: string[];
}

export interface ImportFieldDiff {
  field: string;
  before: string | null;
  after: string | null;
}

export interface ImportDiffSummary {
  novelFields: ImportFieldDiff[];
  chapterCount: { before: number; after: number };
  characterCount: { before: number; after: number };
  conflictIds: string[];
}

export interface ImportPreview {
  targetNovelId: string;
  sourceNovelId: string | null;
  exportedAt: string | null;
  updateNovel: boolean;
  models: ImportModelPlan[];
  totals: {
    create: number;
    update: number;
    skipConflict: number;
    skipReadonly: number;
    skipInvalid: number;
    rows: number;
  };
  diff: ImportDiffSummary;
  requireTypedConfirm: boolean;
  typedConfirmText: string;
  warning: string;
}

export interface ImportExecuteResult extends ImportPreview {
  applied: {
    create: number;
    update: number;
    novelUpdated: boolean;
    errors: Array<{ model: string; id: string; message: string }>;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSlice(raw: unknown): NovelExportSlice {
  if (!isPlainObject(raw)) {
    throw new AppError("导入体必须是导出切片 JSON 对象。", 400);
  }
  if (!isPlainObject(raw.novel)) {
    throw new AppError("切片缺少 novel 对象。", 400);
  }
  if (!isPlainObject(raw.models)) {
    throw new AppError("切片缺少 models 对象。", 400);
  }
  const models: NovelExportSlice["models"] = {};
  for (const [modelName, bucket] of Object.entries(raw.models)) {
    if (!isPlainObject(bucket) || !Array.isArray(bucket.items)) {
      throw new AppError(`模型 ${modelName} 的 items 无效。`, 400);
    }
    models[modelName] = {
      count: Number(bucket.count) || bucket.items.length,
      truncated: Boolean(bucket.truncated),
      items: bucket.items.filter(isPlainObject) as Record<string, unknown>[],
    };
  }
  return {
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
    novelId: typeof raw.novelId === "string" ? raw.novelId : String(raw.novel.id ?? ""),
    novel: raw.novel,
    models,
  };
}

function modelHasNovelId(modelName: string): boolean {
  const meta = listAdminModels().find((model) => model.name === modelName);
  return Boolean(meta?.fields.some((field) => !field.isRelation && field.name === "novelId"));
}

async function classifyRow(
  modelName: string,
  targetNovelId: string,
  item: Record<string, unknown>,
  writeUnlocked: boolean,
): Promise<"create" | "update" | "conflict" | "invalid" | "readonly"> {
  if (!isWriteAllowed(modelName, writeUnlocked)) {
    return "readonly";
  }
  if (!modelHasNovelId(modelName)) {
    return "invalid";
  }

  // NovelBible is 1:1 with novelId — always upsert the target novel's bible row.
  if (modelName === "NovelBible") {
    const bible = await prisma.novelBible.findUnique({ where: { novelId: targetNovelId } });
    return bible ? "update" : "create";
  }

  const id = item.id;
  if (typeof id !== "string" || !id.trim()) {
    return "invalid";
  }
  const meta = getAdminModelMeta(modelName);
  const delegate = (prisma as unknown as Record<string, unknown>)[toPrismaClientKey(modelName)] as
    | FindUniqueDelegate
    | undefined;
  if (!delegate?.findUnique) {
    return "invalid";
  }
  const existing = await delegate.findUnique({ where: { [meta.primaryKey]: id } });
  if (!existing) {
    return "create";
  }
  const existingNovelId = existing.novelId;
  if (typeof existingNovelId === "string" && existingNovelId === targetNovelId) {
    return "update";
  }
  return "conflict";
}

function asDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

export async function previewNovelImport(
  targetNovelId: string,
  rawSlice: unknown,
  options?: { writeUnlocked?: boolean },
): Promise<ImportPreview> {
  const writeUnlocked = Boolean(options?.writeUnlocked);
  const target = await prisma.novel.findUnique({
    where: { id: targetNovelId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      outlineStatus: true,
      storylineStatus: true,
      projectStatus: true,
    },
  });
  if (!target) {
    throw new AppError("目标小说不存在。", 404);
  }

  const slice = parseSlice(rawSlice);
  const allow = new Set<string>(IMPORTABLE_CONTENT_MODELS);
  const plans: ImportModelPlan[] = [];
  let create = 0;
  let update = 0;
  let skipConflict = 0;
  let skipReadonly = 0;
  let skipInvalid = 0;
  let rows = 0;
  const conflictIds: string[] = [];

  for (const modelName of IMPORTABLE_CONTENT_MODELS) {
    const bucket = slice.models[modelName];
    if (!bucket || bucket.items.length === 0) continue;
    const plan: ImportModelPlan = {
      model: modelName,
      create: 0,
      update: 0,
      skipConflict: 0,
      skipReadonly: 0,
      skipInvalid: 0,
      truncatedInSlice: Boolean(bucket.truncated),
      sampleCreateIds: [],
      sampleUpdateIds: [],
      sampleConflictIds: [],
    };
    for (const item of bucket.items) {
      rows += 1;
      if (rows > MAX_TOTAL_ROWS) {
        throw new AppError(`导入行数超过上限 ${MAX_TOTAL_ROWS}。`, 400);
      }
      const kind = await classifyRow(modelName, targetNovelId, item, writeUnlocked);
      if (kind === "create") {
        plan.create += 1;
        create += 1;
        if (plan.sampleCreateIds.length < 5) plan.sampleCreateIds.push(String(item.id));
      } else if (kind === "update") {
        plan.update += 1;
        update += 1;
        if (plan.sampleUpdateIds.length < 5) plan.sampleUpdateIds.push(String(item.id));
      } else if (kind === "conflict") {
        plan.skipConflict += 1;
        skipConflict += 1;
        if (plan.sampleConflictIds.length < 5) plan.sampleConflictIds.push(String(item.id));
        if (typeof item.id === "string" && conflictIds.length < 30) conflictIds.push(`${modelName}:${item.id}`);
      } else if (kind === "readonly") {
        plan.skipReadonly += 1;
        skipReadonly += 1;
      } else {
        plan.skipInvalid += 1;
        skipInvalid += 1;
      }
    }
    plans.push(plan);
  }

  const compareFields = ["title", "description", "status", "outlineStatus", "storylineStatus", "projectStatus"] as const;
  const novelFields: ImportFieldDiff[] = [];
  for (const field of compareFields) {
    const before = asDisplay((target as Record<string, unknown>)[field]);
    const after = asDisplay(slice.novel[field]);
    if (before !== after) {
      novelFields.push({ field, before, after });
    }
  }

  const [chapterBefore, characterBefore] = await Promise.all([
    prisma.chapter.count({ where: { novelId: targetNovelId } }),
    prisma.character.count({ where: { novelId: targetNovelId } }),
  ]);
  const chapterAfter = slice.models.Chapter?.items.length ?? 0;
  const characterAfter = slice.models.Character?.items.length ?? 0;
  const diff: ImportDiffSummary = {
    novelFields,
    chapterCount: { before: chapterBefore, after: chapterAfter },
    characterCount: { before: characterBefore, after: characterAfter },
    conflictIds,
  };

  // Models present in slice but not importable
  const ignored = Object.keys(slice.models).filter((name) => !allow.has(name));
  const warningParts = [
    "导入只会 upsert 内容类表，不会删除库内已有行。",
    "所有子表 novelId 将强制绑定到当前小说。",
    "任务/运行时/快照类表会被忽略。",
  ];
  if (ignored.length > 0) {
    warningParts.push(`已忽略模型：${ignored.slice(0, 12).join(", ")}${ignored.length > 12 ? "…" : ""}`);
  }
  if (slice.novelId && slice.novelId !== targetNovelId) {
    warningParts.push(`切片来自另一本小说（${slice.novelId}），将写入当前小说 ${targetNovelId}。`);
  }
  if (plans.some((plan) => plan.truncatedInSlice)) {
    warningParts.push("部分表在导出时已被截断，导入的也只是截断后的子集。");
  }

  const actionable = create + update;
  return {
    targetNovelId,
    sourceNovelId: slice.novelId || null,
    exportedAt: slice.exportedAt || null,
    updateNovel: true,
    models: plans,
    totals: { create, update, skipConflict, skipReadonly, skipInvalid, rows },
    diff,
    requireTypedConfirm: actionable > 0,
    typedConfirmText: IMPORT_TYPED_CONFIRM,
    warning: warningParts.join(" "),
  };
}

export async function executeNovelImport(
  targetNovelId: string,
  rawSlice: unknown,
  options: { typedConfirm?: string; writeUnlocked?: boolean },
): Promise<ImportExecuteResult> {
  const preview = await previewNovelImport(targetNovelId, rawSlice, {
    writeUnlocked: options.writeUnlocked,
  });
  if (preview.requireTypedConfirm && options.typedConfirm?.trim() !== IMPORT_TYPED_CONFIRM) {
    throw new AppError(`执行导入需要输入确认词：${IMPORT_TYPED_CONFIRM}`, 400);
  }
  if (preview.totals.create + preview.totals.update === 0) {
    throw new AppError("没有可应用的导入行（可能全部冲突、只读或无效）。", 400);
  }

  const slice = parseSlice(rawSlice);
  const writeUnlocked = Boolean(options.writeUnlocked);
  const errors: Array<{ model: string; id: string; message: string }> = [];
  let appliedCreate = 0;
  let appliedUpdate = 0;
  let novelUpdated = false;

  // Update novel scalar fields first (never change id).
  try {
    const novelPayload = { ...slice.novel };
    delete novelPayload.id;
    delete novelPayload.createdAt;
    delete novelPayload.updatedAt;
    await updateAdminRecord("Novel", targetNovelId, novelPayload, { writeUnlocked: true });
    novelUpdated = true;
  } catch (error) {
    errors.push({
      model: "Novel",
      id: targetNovelId,
      message: error instanceof Error ? error.message : "更新小说失败",
    });
  }

  for (const modelName of IMPORTABLE_CONTENT_MODELS) {
    const bucket = slice.models[modelName];
    if (!bucket) continue;
    for (const item of bucket.items) {
      const kind = await classifyRow(modelName, targetNovelId, item, writeUnlocked);
      if (kind !== "create" && kind !== "update") continue;
      const payload: Record<string, unknown> = { ...item, novelId: targetNovelId };
      delete payload.createdAt;
      delete payload.updatedAt;
      try {
        if (modelName === "NovelBible") {
          const existingBible = await prisma.novelBible.findUnique({ where: { novelId: targetNovelId } });
          if (existingBible) {
            delete payload.id;
            await updateAdminRecord(modelName, existingBible.id, payload, { writeUnlocked });
            appliedUpdate += 1;
          } else {
            await createAdminRecord(modelName, payload, { writeUnlocked });
            appliedCreate += 1;
          }
          continue;
        }
        const id = typeof item.id === "string" ? item.id : "";
        if (kind === "create") {
          await createAdminRecord(modelName, payload, { writeUnlocked });
          appliedCreate += 1;
        } else {
          await updateAdminRecord(modelName, id, payload, { writeUnlocked });
          appliedUpdate += 1;
        }
      } catch (error) {
        errors.push({
          model: modelName,
          id: typeof item.id === "string" ? item.id : "(missing)",
          message: error instanceof Error ? error.message : "写入失败",
        });
      }
    }
  }

  appendAdminAudit({
    action: "update",
    model: "Novel",
    recordId: targetNovelId,
    novelId: targetNovelId,
    summary: `导入切片：新建 ${appliedCreate} · 更新 ${appliedUpdate} · 错误 ${errors.length}`,
    changedFields: preview.models.map((plan) => plan.model),
  });

  return {
    ...preview,
    applied: {
      create: appliedCreate,
      update: appliedUpdate,
      novelUpdated,
      errors: errors.slice(0, 50),
    },
  };
}
