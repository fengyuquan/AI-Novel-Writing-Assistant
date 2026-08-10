import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { toPrismaClientKey } from "../domain/adminPolicy";
import { getNovelDrilldownOverview } from "./adminDrilldownService";
import { getAdminModelMeta, listAdminModels } from "./adminMetaService";

export interface DeleteImpactRow {
  model: string;
  foreignKey: string;
  count: number;
}

export interface DeletePreview {
  model: string;
  id: string;
  label: string;
  riskLevel: "low" | "medium" | "high";
  requireTypedConfirm: boolean;
  typedConfirmText: string;
  impacts: DeleteImpactRow[];
  totalRelatedRows: number;
  warning: string;
}

type CountDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
};

function getDelegate(modelName: string): CountDelegate {
  const clientKey = toPrismaClientKey(modelName);
  const delegate = (prisma as unknown as Record<string, unknown>)[clientKey] as CountDelegate | undefined;
  if (!delegate?.count || !delegate.findUnique) {
    throw new AppError(`Prisma delegate not found for model ${modelName}.`, 500);
  }
  return delegate;
}

function resolveLabel(record: Record<string, unknown>, id: string): string {
  for (const key of ["title", "name", "provider", "key", "status"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return id;
}

async function countByForeignKey(modelName: string, foreignKey: string, id: string): Promise<number> {
  try {
    return await getDelegate(modelName).count({ where: { [foreignKey]: id } });
  } catch {
    return 0;
  }
}

function listIncomingRelations(targetModel: string): Array<{ model: string; foreignKey: string }> {
  return listAdminModels()
    .filter((model) => model.name !== targetModel)
    .flatMap((model) => {
      const fks = model.fields.filter(
        (field) => !field.isRelation && field.isForeignKey && field.relationTo === targetModel,
      );
      return fks.map((field) => ({ model: model.name, foreignKey: field.name }));
    });
}

function coerceId(modelPrimaryKeyType: string | undefined, rawId: string): string | number {
  if (modelPrimaryKeyType === "Int" || modelPrimaryKeyType === "BigInt") {
    const parsed = Number(rawId);
    if (!Number.isFinite(parsed)) {
      throw new AppError("主键必须是数字。", 400);
    }
    return parsed;
  }
  return rawId;
}

export async function getDeletePreview(modelName: string, id: string): Promise<DeletePreview> {
  const model = getAdminModelMeta(modelName);
  const pkType = model.fields.find((field) => field.isPrimaryKey)?.type;
  const pkValue = coerceId(pkType, id);
  const record = await getDelegate(modelName).findUnique({
    where: { [model.primaryKey]: pkValue },
  });
  if (!record) {
    throw new AppError("记录不存在。", 404);
  }

  let impacts: DeleteImpactRow[] = [];
  if (modelName === "Novel") {
    const overview = await getNovelDrilldownOverview(id);
    impacts = overview.children
      .filter((child) => child.count > 0)
      .map((child) => ({
        model: child.model,
        foreignKey: child.foreignKey,
        count: child.count,
      }));
  } else {
    const relations = listIncomingRelations(modelName);
    const counted = await Promise.all(
      relations.map(async (relation) => ({
        ...relation,
        count: await countByForeignKey(relation.model, relation.foreignKey, id),
      })),
    );
    impacts = counted.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  }

  const totalRelatedRows = impacts.reduce((sum, item) => sum + item.count, 0);
  const requireTypedConfirm = modelName === "Novel" || totalRelatedRows >= 20;
  const riskLevel: DeletePreview["riskLevel"] =
    modelName === "Novel" || totalRelatedRows >= 50 ? "high" : totalRelatedRows > 0 ? "medium" : "low";

  return {
    model: modelName,
    id,
    label: resolveLabel(record, id),
    riskLevel,
    requireTypedConfirm,
    typedConfirmText: "DELETE",
    impacts: impacts.slice(0, 40),
    totalRelatedRows,
    warning:
      riskLevel === "high"
        ? "高风险删除：可能级联清理大量关联数据。请先备份数据库，再输入 DELETE 确认。"
        : totalRelatedRows > 0
          ? "删除后，下列关联记录可能被级联删除或变为无效引用。请确认已备份。"
          : "未检测到直接外键关联行，但仍请确认这不是误删。",
  };
}
