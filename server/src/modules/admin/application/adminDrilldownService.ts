import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { PINNED_NOVEL_CHILDREN, toPrismaClientKey } from "../domain/adminPolicy";
import { getAdminModelMeta, listAdminModels } from "./adminMetaService";

export interface NovelChildModelSummary {
  model: string;
  foreignKey: string;
  count: number;
  pinned: boolean;
}

export interface NovelDrilldownOverview {
  novel: {
    id: string;
    title: string;
    status: string | null;
    updatedAt: string | null;
  };
  children: NovelChildModelSummary[];
  childModelCount: number;
  totalRelatedRows: number;
}

type CountDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};

function listNovelChildModels(): Array<{ model: string; foreignKey: string; pinned: boolean }> {
  const pinnedIndex = new Map((PINNED_NOVEL_CHILDREN as readonly string[]).map((name, index) => [name, index]));
  return listAdminModels()
    .filter((model) => model.name !== "Novel")
    .map((model) => {
      const novelIdField = model.fields.find(
        (field) =>
          !field.isRelation &&
          field.name === "novelId" &&
          (field.relationTo === "Novel" || field.isForeignKey),
      );
      if (!novelIdField) {
        return null;
      }
      return {
        model: model.name,
        foreignKey: novelIdField.name,
        pinned: pinnedIndex.has(model.name),
      };
    })
    .filter((item): item is { model: string; foreignKey: string; pinned: boolean } => Boolean(item))
    .sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      const leftPin = pinnedIndex.get(left.model) ?? Number.MAX_SAFE_INTEGER;
      const rightPin = pinnedIndex.get(right.model) ?? Number.MAX_SAFE_INTEGER;
      if (left.pinned && right.pinned && leftPin !== rightPin) {
        return leftPin - rightPin;
      }
      return left.model.localeCompare(right.model);
    });
}

async function countModelByNovelId(modelName: string, foreignKey: string, novelId: string): Promise<number> {
  const clientKey = toPrismaClientKey(modelName);
  const delegate = (prisma as unknown as Record<string, unknown>)[clientKey] as CountDelegate | undefined;
  if (!delegate?.count) {
    return 0;
  }
  try {
    return await delegate.count({ where: { [foreignKey]: novelId } });
  } catch {
    return 0;
  }
}

export async function getNovelDrilldownOverview(novelId: string): Promise<NovelDrilldownOverview> {
  getAdminModelMeta("Novel");
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });
  if (!novel) {
    throw new AppError("小说不存在。", 404);
  }

  const childDefs = listNovelChildModels();
  const counts = await Promise.all(
    childDefs.map(async (child) => ({
      ...child,
      count: await countModelByNovelId(child.model, child.foreignKey, novelId),
    })),
  );

  // Keep pinned always; keep non-pinned only when they have rows, plus a short empty tail for discovery.
  const pinned = counts.filter((item) => item.pinned);
  const withRows = counts.filter((item) => !item.pinned && item.count > 0);
  const emptyOthers = counts.filter((item) => !item.pinned && item.count === 0).slice(0, 12);
  const children = [...pinned, ...withRows, ...emptyOthers];

  return {
    novel: {
      id: novel.id,
      title: novel.title,
      status: novel.status ?? null,
      updatedAt: novel.updatedAt ? novel.updatedAt.toISOString() : null,
    },
    children,
    childModelCount: childDefs.length,
    totalRelatedRows: counts.reduce((sum, item) => sum + item.count, 0),
  };
}

export function listNovelChildModelNames(): string[] {
  return listNovelChildModels().map((item) => item.model);
}
