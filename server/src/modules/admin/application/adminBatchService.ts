import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import {
  BATCH_DEFAULT_MAX_ROWS,
  BATCH_HARD_MAX_ROWS,
  isBatchAllowedModel,
  isSafeBatchTargetStatus,
  type BatchAction,
} from "../domain/adminBatchPolicy";
import { toPrismaClientKey } from "../domain/adminPolicy";
import { appendAdminAudit } from "../infrastructure/adminAuditStore";
import { getAdminModelMeta, type AdminModelMeta } from "./adminMetaService";

type PrismaDelegate = {
  count: (args?: Record<string, unknown>) => Promise<number>;
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
};

export interface BatchRequest {
  model: string;
  action: BatchAction;
  where?: Record<string, unknown>;
  setStatus?: string;
  maxRows?: number;
  confirm?: boolean;
  typedConfirm?: string;
}

export interface BatchPreview {
  model: string;
  action: BatchAction;
  matchedCount: number;
  cappedCount: number;
  maxRows: number;
  requireTypedConfirm: boolean;
  typedConfirmText: string;
  sampleIds: string[];
  setStatus: string | null;
  warning: string;
}

function getDelegate(model: AdminModelMeta): PrismaDelegate {
  const clientKey = toPrismaClientKey(model.name);
  const delegate = (prisma as unknown as Record<string, unknown>)[clientKey] as PrismaDelegate | undefined;
  if (!delegate?.count || !delegate.findMany || !delegate.updateMany || !delegate.deleteMany) {
    throw new AppError(`Prisma delegate not found for model ${model.name}.`, 500);
  }
  return delegate;
}

function sanitizeWhere(model: AdminModelMeta, where: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!where || typeof where !== "object" || Array.isArray(where)) {
    throw new AppError("批量操作必须提供 where 条件，禁止全表操作。", 400);
  }
  const allowed = new Set(model.fields.filter((field) => !field.isRelation).map((field) => field.name));
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (!allowed.has(key) || key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      const safeOps: Record<string, unknown> = {};
      for (const op of ["equals", "contains", "gt", "gte", "lt", "lte", "in", "not"] as const) {
        if (op in ops) {
          safeOps[op] = ops[op];
        }
      }
      if (Object.keys(safeOps).length > 0) {
        next[key] = safeOps;
      }
      continue;
    }
    next[key] = value;
  }
  if (Object.keys(next).length === 0) {
    throw new AppError("where 条件无效或为空，拒绝执行。", 400);
  }
  return next;
}

function resolveMaxRows(raw: number | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return BATCH_DEFAULT_MAX_ROWS;
  }
  return Math.min(BATCH_HARD_MAX_ROWS, Math.trunc(value));
}

function assertBatchRequest(input: BatchRequest): {
  model: AdminModelMeta;
  action: BatchAction;
  where: Record<string, unknown>;
  setStatus: string | null;
  maxRows: number;
} {
  if (!isBatchAllowedModel(input.model)) {
    throw new AppError("该模型不允许批量操作。仅支持任务类模型。", 400);
  }
  if (input.action !== "update_status" && input.action !== "delete_matching") {
    throw new AppError("不支持的批量动作。", 400);
  }
  const model = getAdminModelMeta(input.model);
  if (!model.fields.some((field) => field.name === "status" && !field.isRelation)) {
    throw new AppError("该模型没有 status 字段。", 400);
  }
  const where = sanitizeWhere(model, input.where);
  let setStatus: string | null = null;
  if (input.action === "update_status") {
    const status = input.setStatus?.trim() ?? "";
    if (!status || !isSafeBatchTargetStatus(status)) {
      throw new AppError("目标 status 不在安全白名单内。", 400);
    }
    setStatus = status;
  }
  return {
    model,
    action: input.action,
    where,
    setStatus,
    maxRows: resolveMaxRows(input.maxRows),
  };
}

export async function previewAdminBatch(input: BatchRequest): Promise<BatchPreview> {
  const prepared = assertBatchRequest(input);
  const delegate = getDelegate(prepared.model);
  const matchedCount = await delegate.count({ where: prepared.where });
  const cappedCount = Math.min(matchedCount, prepared.maxRows);
  const samples = await delegate.findMany({
    where: prepared.where,
    select: { [prepared.model.primaryKey]: true },
    take: Math.min(10, cappedCount || 10),
    orderBy: prepared.model.fields.some((field) => field.name === "updatedAt")
      ? { updatedAt: "desc" }
      : { [prepared.model.primaryKey]: "desc" },
  });
  const requireTypedConfirm = prepared.action === "delete_matching" || cappedCount >= 10;
  return {
    model: prepared.model.name,
    action: prepared.action,
    matchedCount,
    cappedCount,
    maxRows: prepared.maxRows,
    requireTypedConfirm,
    typedConfirmText: "BATCH",
    sampleIds: samples.map((row) => String(row[prepared.model.primaryKey] ?? "")).filter(Boolean),
    setStatus: prepared.setStatus,
    warning:
      prepared.action === "delete_matching"
        ? `将删除最多 ${cappedCount} 条匹配记录（匹配总计 ${matchedCount}）。请先备份。`
        : `将把最多 ${cappedCount} 条记录的 status 改为 ${prepared.setStatus}（匹配总计 ${matchedCount}）。`,
  };
}

export async function executeAdminBatch(input: BatchRequest): Promise<BatchPreview & { affectedCount: number }> {
  if (!input.confirm) {
    throw new AppError("批量执行需要 confirm=true。", 400);
  }
  const preview = await previewAdminBatch(input);
  if (preview.requireTypedConfirm && input.typedConfirm?.trim() !== preview.typedConfirmText) {
    throw new AppError(`请输入确认词：${preview.typedConfirmText}`, 400);
  }
  if (preview.cappedCount === 0) {
    throw new AppError("没有匹配到可操作的记录。", 400);
  }

  const prepared = assertBatchRequest(input);
  const delegate = getDelegate(prepared.model);

  // Cap by selecting IDs first, then update/delete by id in — avoids unbounded updateMany.
  const targets = await delegate.findMany({
    where: prepared.where,
    select: { [prepared.model.primaryKey]: true },
    take: prepared.maxRows,
    orderBy: prepared.model.fields.some((field) => field.name === "updatedAt")
      ? { updatedAt: "desc" }
      : { [prepared.model.primaryKey]: "desc" },
  });
  const ids = targets.map((row) => row[prepared.model.primaryKey]).filter((value) => value !== undefined);
  if (ids.length === 0) {
    throw new AppError("没有匹配到可操作的记录。", 400);
  }

  const idWhere = { [prepared.model.primaryKey]: { in: ids } };
  let affectedCount = 0;
  if (prepared.action === "update_status") {
    const result = await delegate.updateMany({
      where: idWhere,
      data: { status: prepared.setStatus },
    });
    affectedCount = result.count;
  } else {
    const result = await delegate.deleteMany({ where: idWhere });
    affectedCount = result.count;
  }

  const novelId =
    typeof prepared.where.novelId === "string"
      ? prepared.where.novelId
      : null;

  appendAdminAudit({
    action: prepared.action === "delete_matching" ? "delete" : "update",
    model: prepared.model.name,
    recordId: `batch:${affectedCount}`,
    novelId,
    summary:
      prepared.action === "delete_matching"
        ? `批量删除 ${affectedCount} 条`
        : `批量将 status 改为 ${prepared.setStatus}（${affectedCount} 条）`,
    changedFields: prepared.action === "update_status" ? ["status"] : [],
  });

  return {
    ...preview,
    affectedCount,
    cappedCount: affectedCount,
  };
}
