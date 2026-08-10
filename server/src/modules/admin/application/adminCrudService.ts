import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import {
  isSensitiveField,
  isWriteAllowed,
  maskSensitiveValue,
  toPrismaClientKey,
} from "../domain/adminPolicy";
import { appendAdminAudit } from "../infrastructure/adminAuditStore";
import { getDeletePreview } from "./adminDeletePreviewService";
import { getAdminModelMeta, type AdminModelMeta } from "./adminMetaService";

type PrismaDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  count: (args?: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  delete: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  where?: Record<string, unknown>;
}

function getDelegate(model: AdminModelMeta): PrismaDelegate {
  const clientKey = toPrismaClientKey(model.name);
  const delegate = (prisma as unknown as Record<string, unknown>)[clientKey];
  if (!delegate || typeof delegate !== "object") {
    throw new AppError(`Prisma delegate not found for model ${model.name}.`, 500);
  }
  return delegate as PrismaDelegate;
}

function coercePrimaryKeyValue(model: AdminModelMeta, rawId: string): string | number {
  const pkField = model.fields.find((field) => field.isPrimaryKey);
  if (!pkField) {
    return rawId;
  }
  if (pkField.type === "Int" || pkField.type === "BigInt") {
    const parsed = Number(rawId);
    if (!Number.isFinite(parsed)) {
      throw new AppError("主键必须是数字。", 400);
    }
    return parsed;
  }
  return rawId;
}

function sanitizeRecord(model: AdminModelMeta, record: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveField(model.name, key)) {
      next[key] = maskSensitiveValue(value);
      next[`${key}__masked`] = value !== null && value !== undefined && value !== "";
      continue;
    }
    if (value instanceof Date) {
      next[key] = value.toISOString();
      continue;
    }
    if (typeof value === "bigint") {
      next[key] = value.toString();
      continue;
    }
    next[key] = value;
  }
  return next;
}

function buildSearchWhere(model: AdminModelMeta, q: string | undefined): Record<string, unknown> | undefined {
  const trimmed = q?.trim();
  if (!trimmed) {
    return undefined;
  }
  const stringFields = model.fields.filter(
    (field) => !field.isRelation && (field.type === "String" || field.kind === "enum"),
  );
  if (stringFields.length === 0) {
    return undefined;
  }
  return {
    OR: stringFields.slice(0, 8).map((field) => ({
      [field.name]: {
        contains: trimmed,
      },
    })),
  };
}

function sanitizeWhere(model: AdminModelMeta, where: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!where || typeof where !== "object" || Array.isArray(where)) {
    return undefined;
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
  return Object.keys(next).length > 0 ? next : undefined;
}

function mergeWhere(...parts: Array<Record<string, unknown> | undefined>): Record<string, unknown> | undefined {
  const filtered = parts.filter((part): part is Record<string, unknown> => Boolean(part && Object.keys(part).length));
  if (filtered.length === 0) {
    return undefined;
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return { AND: filtered };
}

function prepareWriteData(
  model: AdminModelMeta,
  input: Record<string, unknown>,
  mode: "create" | "update",
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError("请求体无效。", 400);
  }
  const writable = new Set(
    model.fields
      .filter((field) => field.isWritable || (mode === "create" && field.isPrimaryKey && field.type === "String"))
      .map((field) => field.name),
  );
  // On create, allow non-PK writable scalars/enums; PK usually cuid default.
  for (const field of model.fields) {
    if (!field.isRelation && !field.isPrimaryKey && field.name !== "createdAt" && field.name !== "updatedAt") {
      writable.add(field.name);
    }
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!writable.has(key) || key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const field = model.fields.find((item) => item.name === key);
    if (!field || field.isRelation) {
      continue;
    }
    if (mode === "update" && isSensitiveField(model.name, key)) {
      if (value === undefined || value === null || value === "" || value === "********") {
        continue;
      }
    }
    if (field.type === "Int" || field.type === "Float" || field.type === "Decimal") {
      if (value === "" || value === null || value === undefined) {
        data[key] = null;
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new AppError(`字段 ${key} 必须是数字。`, 400);
        }
        data[key] = field.type === "Int" ? Math.trunc(parsed) : parsed;
      }
      continue;
    }
    if (field.type === "Boolean") {
      data[key] = value === true || value === "true" || value === 1 || value === "1";
      continue;
    }
    if (field.type === "DateTime") {
      if (value === "" || value === null || value === undefined) {
        data[key] = null;
      } else {
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) {
          throw new AppError(`字段 ${key} 必须是合法时间。`, 400);
        }
        data[key] = date;
      }
      continue;
    }
    if (field.type === "Json") {
      if (value === "" || value === null || value === undefined) {
        data[key] = null;
      } else if (typeof value === "string") {
        try {
          data[key] = JSON.parse(value) as unknown;
        } catch {
          throw new AppError(`字段 ${key} 必须是合法 JSON。`, 400);
        }
      } else {
        data[key] = value;
      }
      continue;
    }
    if (field.isJsonLike && typeof value === "string" && value.trim()) {
      try {
        JSON.parse(value);
      } catch {
        throw new AppError(`字段 ${key} 必须是合法 JSON 字符串。`, 400);
      }
    }
    data[key] = value;
  }
  return data;
}

export async function listAdminRecords(modelName: string, query: AdminListQuery) {
  const model = getAdminModelMeta(modelName);
  const delegate = getDelegate(model);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const orderField = model.fields.find((field) => field.name === query.orderBy && !field.isRelation)?.name
    ?? model.primaryKey;
  const orderDir = query.orderDir === "desc" ? "desc" : "asc";
  const where = mergeWhere(buildSearchWhere(model, query.q), sanitizeWhere(model, query.where));

  const [total, rows] = await Promise.all([
    delegate.count(where ? { where } : undefined),
    delegate.findMany({
      where,
      orderBy: { [orderField]: orderDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    model: model.name,
    primaryKey: model.primaryKey,
    page,
    pageSize,
    total,
    items: rows.map((row) => sanitizeRecord(model, row)),
  };
}

export async function getAdminRecord(modelName: string, id: string) {
  const model = getAdminModelMeta(modelName);
  const delegate = getDelegate(model);
  const row = await delegate.findUnique({
    where: { [model.primaryKey]: coercePrimaryKeyValue(model, id) },
  });
  if (!row) {
    throw new AppError("记录不存在。", 404);
  }
  return {
    model: model.name,
    primaryKey: model.primaryKey,
    item: sanitizeRecord(model, row),
  };
}

function resolveNovelId(row: Record<string, unknown> | null | undefined): string | null {
  const value = row?.novelId;
  return typeof value === "string" && value.trim() ? value : null;
}

function assertWritable(modelName: string, writeUnlocked: boolean): void {
  if (!isWriteAllowed(modelName, writeUnlocked)) {
    throw new AppError(
      `模型 ${modelName} 默认只读。若确需修改，请在管理台开启「高级写解锁」后再操作。`,
      403,
    );
  }
}

export async function createAdminRecord(
  modelName: string,
  input: Record<string, unknown>,
  options?: { writeUnlocked?: boolean },
) {
  assertWritable(modelName, Boolean(options?.writeUnlocked));
  const model = getAdminModelMeta(modelName);
  const delegate = getDelegate(model);
  const data = prepareWriteData(model, input, "create");
  const row = await delegate.create({ data });
  const recordId = String(row[model.primaryKey] ?? "");
  appendAdminAudit({
    action: "create",
    model: model.name,
    recordId,
    novelId: resolveNovelId(row) ?? (model.name === "Novel" ? recordId : null),
    summary: `创建 ${model.name}`,
    changedFields: Object.keys(data),
  });
  return {
    model: model.name,
    primaryKey: model.primaryKey,
    item: sanitizeRecord(model, row),
  };
}

export async function updateAdminRecord(
  modelName: string,
  id: string,
  input: Record<string, unknown>,
  options?: { writeUnlocked?: boolean },
) {
  assertWritable(modelName, Boolean(options?.writeUnlocked));
  const model = getAdminModelMeta(modelName);
  const delegate = getDelegate(model);
  const data = prepareWriteData(model, input, "update");
  if (Object.keys(data).length === 0) {
    throw new AppError("没有可更新的字段。", 400);
  }
  try {
    const row = await delegate.update({
      where: { [model.primaryKey]: coercePrimaryKeyValue(model, id) },
      data,
    });
    const recordId = String(row[model.primaryKey] ?? id);
    appendAdminAudit({
      action: "update",
      model: model.name,
      recordId,
      novelId: resolveNovelId(row) ?? (model.name === "Novel" ? recordId : null),
      summary: `更新 ${model.name}`,
      changedFields: Object.keys(data),
    });
    return {
      model: model.name,
      primaryKey: model.primaryKey,
      item: sanitizeRecord(model, row),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败。";
    if (message.includes("Record to update not found") || message.includes("P2025")) {
      throw new AppError("记录不存在。", 404);
    }
    throw error;
  }
}

export async function deleteAdminRecord(
  modelName: string,
  id: string,
  options: { confirm: boolean; typedConfirm?: string; writeUnlocked?: boolean },
) {
  if (!options.confirm) {
    throw new AppError("删除需要 confirm=true，并请确认已备份数据库。", 400);
  }
  assertWritable(modelName, Boolean(options.writeUnlocked));
  const preview = await getDeletePreview(modelName, id);
  if (preview.requireTypedConfirm && options.typedConfirm?.trim() !== preview.typedConfirmText) {
    throw new AppError(`高风险删除需要输入确认词：${preview.typedConfirmText}`, 400);
  }
  const model = getAdminModelMeta(modelName);
  const delegate = getDelegate(model);
  try {
    const row = await delegate.delete({
      where: { [model.primaryKey]: coercePrimaryKeyValue(model, id) },
    });
    const recordId = String(row[model.primaryKey] ?? id);
    appendAdminAudit({
      action: "delete",
      model: model.name,
      recordId,
      novelId: resolveNovelId(row) ?? (model.name === "Novel" ? recordId : null),
      summary: `删除 ${model.name}（关联约 ${preview.totalRelatedRows} 行）`,
      changedFields: [],
    });
    return {
      model: model.name,
      primaryKey: model.primaryKey,
      item: sanitizeRecord(model, row),
      preview,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败。";
    if (message.includes("Record to delete does not exist") || message.includes("P2025")) {
      throw new AppError("记录不存在。", 404);
    }
    throw error;
  }
}
