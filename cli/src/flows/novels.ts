import { unwrapNovel, unwrapNovels, type NovelCliApi } from "../api.js";
import type { CliSession } from "../session.js";
import { loadCliProfile } from "../profile.js";
import { ask, choose, confirm } from "../lib/prompt.js";
import {
  printInfo,
  printKeyValues,
  printSuccess,
  printTitle,
  printWarn,
} from "../lib/print.js";

export async function selectOrCreateNovel(api: NovelCliApi, session: CliSession): Promise<void> {
  printTitle("小说项目");

  const action = await choose("你想做什么？", [
    { value: "list", label: "选择已有小说", hint: "从列表里进入当前会话" },
    { value: "create", label: "新建小说", hint: "创建后自动设为当前小说" },
    { value: "back", label: "返回主菜单" },
  ]);

  if (action === "back") {
    return;
  }
  if (action === "create") {
    await createNovelFlow(api, session);
    return;
  }
  await listAndSelectNovel(api, session);
}

async function listAndSelectNovel(api: NovelCliApi, session: CliSession): Promise<void> {
  const response = await api.listNovels(1, 30);
  const novels = unwrapNovels(response.data);
  if (novels.length === 0) {
    printWarn("还没有小说。先新建一本吧。");
    const shouldCreate = await confirm("现在新建吗？", true);
    if (shouldCreate) {
      await createNovelFlow(api, session);
    }
    return;
  }

  const novelId = await choose(
    "选择小说",
    [
      ...novels.map((novel) => ({
        value: novel.id,
        label: novel.title,
        hint: novel.creationExperience === "simple" ? "简易创作" : novel.updatedAt?.slice(0, 10),
      })),
      { value: "__back", label: "返回" },
    ],
  );

  if (novelId === "__back") {
    return;
  }

  const detail = unwrapNovel((await api.getNovel(novelId)).data);
  session.novelId = novelId;
  session.novelTitle = detail?.title ?? novels.find((item) => item.id === novelId)?.title ?? novelId;
  printSuccess(`已选择小说：${session.novelTitle}`);
}

async function createNovelFlow(api: NovelCliApi, session: CliSession): Promise<void> {
  const title = await ask("小说标题");
  if (!title.trim()) {
    printWarn("标题不能为空。");
    return;
  }
  const description = await ask("一句话简介（可留空）");
  const experience = await choose("创作方式", [
    { value: "simple", label: "简易创作", hint: "更适合新手，偏自动完成整本" },
    { value: "professional", label: "专业创作", hint: "进入完整工作台式流程" },
  ]);

  const outlineFirst = loadCliProfile().outlineFirst;
  const applyTargets = await confirm(
    `套用已保存的大纲优先设定？（${outlineFirst.estimatedChapterCount} 章 · 每章 ≥ ${outlineFirst.minChapterWords} 字）`,
    outlineFirst.preferOutlineFirst,
  );

  const created = (await api.createNovel({
    title: title.trim(),
    description: description.trim() || undefined,
    creationExperience: experience,
    ...(applyTargets
      ? {
        estimatedChapterCount: outlineFirst.estimatedChapterCount,
        defaultChapterLength: outlineFirst.minChapterWords,
      }
      : {}),
  })).data;

  if (!created?.id) {
    printWarn("创建小说失败。");
    return;
  }

  session.novelId = created.id;
  session.novelTitle = created.title;
  session.directorTaskId = null;
  printSuccess(`已创建并选中：${created.title}`);
  printKeyValues([
    ["ID", created.id],
    ["创作方式", experience === "simple" ? "简易创作" : "专业创作"],
    ...(applyTargets
      ? [
        ["期望章数", String(outlineFirst.estimatedChapterCount)],
        ["每章字数不少于", String(outlineFirst.minChapterWords)],
      ] as Array<[string, string]>
      : []),
  ]);
}

export async function requireNovel(session: CliSession): Promise<boolean> {
  if (session.novelId) {
    return true;
  }
  printWarn("请先选择或新建一本小说。");
  printInfo("主菜单 → 小说项目");
  return false;
}
