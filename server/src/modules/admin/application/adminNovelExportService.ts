import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { PINNED_NOVEL_CHILDREN, toPrismaClientKey } from "../domain/adminPolicy";
import { listAdminModels } from "./adminMetaService";

const EXPORT_MAX_ROWS_PER_MODEL = 500;

type FindManyDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
};

export interface NovelExportSlice {
  exportedAt: string;
  novelId: string;
  novel: Record<string, unknown>;
  models: Record<string, { count: number; truncated: boolean; items: Record<string, unknown>[] }>;
}

function listExportChildModels(): Array<{ model: string; foreignKey: string }> {
  const pinned = new Set<string>(PINNED_NOVEL_CHILDREN);
  return listAdminModels()
    .filter((model) => model.name !== "Novel")
    .map((model) => {
      const novelIdField = model.fields.find(
        (field) => !field.isRelation && field.name === "novelId",
      );
      if (!novelIdField) return null;
      return { model: model.name, foreignKey: "novelId", pinned: pinned.has(model.name) };
    })
    .filter((item): item is { model: string; foreignKey: string; pinned: boolean } => Boolean(item))
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return left.model.localeCompare(right.model);
    })
    .map(({ model, foreignKey }) => ({ model, foreignKey }));
}

export async function exportNovelSlice(novelId: string): Promise<NovelExportSlice> {
  const novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) {
    throw new AppError("小说不存在。", 404);
  }

  const models: NovelExportSlice["models"] = {};
  for (const child of listExportChildModels()) {
    const delegate = (prisma as unknown as Record<string, unknown>)[toPrismaClientKey(child.model)] as
      | FindManyDelegate
      | undefined;
    if (!delegate?.findMany) continue;
    try {
      const items = await delegate.findMany({
        where: { [child.foreignKey]: novelId },
        take: EXPORT_MAX_ROWS_PER_MODEL + 1,
        orderBy: { id: "asc" },
      });
      const truncated = items.length > EXPORT_MAX_ROWS_PER_MODEL;
      const capped = truncated ? items.slice(0, EXPORT_MAX_ROWS_PER_MODEL) : items;
      if (capped.length === 0) continue;
      models[child.model] = {
        count: capped.length,
        truncated,
        items: capped.map((row) => {
          const next: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            if (value instanceof Date) {
              next[key] = value.toISOString();
            } else if (typeof value === "bigint") {
              next[key] = value.toString();
            } else {
              next[key] = value;
            }
          }
          return next;
        }),
      };
    } catch {
      // skip models that cannot be queried with this where shape
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    novelId,
    novel: JSON.parse(JSON.stringify(novel)) as Record<string, unknown>,
    models,
  };
}
