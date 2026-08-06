import type { NovelCliApi } from "../api.js";
import type { CliSession } from "../session.js";
import { choose } from "../lib/prompt.js";
import {
  printInfo,
  printKeyValues,
  printTitle,
  printWarn,
} from "../lib/print.js";
import { requireNovel } from "./novels.js";

export async function browseChapters(api: NovelCliApi, session: CliSession): Promise<void> {
  if (!(await requireNovel(session))) {
    return;
  }

  printTitle("章节书架");
  const chapters = (await api.listChapters(session.novelId!)).data ?? [];
  if (!Array.isArray(chapters) || chapters.length === 0) {
    printWarn("这本小说还没有章节。先跑自动导演或到网页端生产章节。");
    return;
  }

  const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const chapterId = await choose(
    "选择章节查看",
    [
      ...sorted.map((chapter) => ({
        value: chapter.id,
        label: `第 ${chapter.order ?? "?"} 章 ${chapter.title || "未命名"}`,
        hint: chapter.chapterStatus || chapter.generationState || undefined,
      })),
      { value: "__back", label: "返回" },
    ],
  );

  if (chapterId === "__back") {
    return;
  }

  const chapter = (await api.getChapter(session.novelId!, chapterId)).data
    ?? sorted.find((item) => item.id === chapterId);
  if (!chapter) {
    printWarn("章节不存在。");
    return;
  }

  const content = chapter.content?.trim() || "";
  printTitle(chapter.title || "未命名章节");
  printKeyValues([
    ["序号", String(chapter.order ?? "-")],
    ["状态", String(chapter.chapterStatus ?? chapter.generationState ?? "-")],
    ["字数", String(content.length)],
  ]);

  if (!content) {
    printWarn("这一章还没有可读正文。");
    return;
  }

  printInfo("正文预览（前 800 字）：");
  printInfo(content.slice(0, 800));
  if (content.length > 800) {
    printInfo("…（后续内容请到网页端阅读完整章节）");
  }
}
