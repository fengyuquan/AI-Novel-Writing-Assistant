import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";

const MAX_RESULTS = 40;
const SNIPPET_RADIUS = 60;

export interface ChapterSearchHit {
  id: string;
  order: number;
  title: string;
  match: "title" | "content" | "both";
  snippet: string | null;
}

function buildSnippet(content: string, query: string): string | null {
  const lower = content.toLowerCase();
  const needle = query.toLowerCase();
  const index = lower.indexOf(needle);
  if (index < 0) return null;
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(content.length, index + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end).replace(/\s+/g, " ")}${suffix}`;
}

export async function searchNovelChapters(novelId: string, q: string): Promise<{
  novelId: string;
  q: string;
  total: number;
  items: ChapterSearchHit[];
}> {
  const query = q.trim();
  if (!query) {
    throw new AppError("请输入搜索关键词。", 400);
  }
  if (query.length > 80) {
    throw new AppError("搜索关键词过长。", 400);
  }

  const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { id: true } });
  if (!novel) {
    throw new AppError("小说不存在。", 404);
  }

  const rows = await prisma.chapter.findMany({
    where: {
      novelId,
      OR: [
        { title: { contains: query } },
        { content: { contains: query } },
      ],
    },
    orderBy: { order: "asc" },
    take: MAX_RESULTS,
    select: {
      id: true,
      order: true,
      title: true,
      content: true,
    },
  });

  const items: ChapterSearchHit[] = rows.map((row) => {
    const titleHit = row.title.toLowerCase().includes(query.toLowerCase());
    const content = row.content ?? "";
    const contentHit = content.toLowerCase().includes(query.toLowerCase());
    return {
      id: row.id,
      order: row.order,
      title: row.title,
      match: titleHit && contentHit ? "both" : titleHit ? "title" : "content",
      snippet: contentHit ? buildSnippet(content, query) : null,
    };
  });

  return {
    novelId,
    q: query,
    total: items.length,
    items,
  };
}
