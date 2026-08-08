import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CHAPTER_OUTLINE_IMPORT_TEMPLATE } from "@ai-novel/shared/utils/outlineImport";
import type { OutlineCreateBootstrapDraft } from "@ai-novel/shared/types/outlineCreateBootstrap";
import type { ParsedChapterOutline } from "@ai-novel/shared/utils/outlineImport";
import {
  createNovelFromOutline,
  previewCreateNovelFromOutline,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type Step = "paste" | "review";

function emptyBootstrap(): OutlineCreateBootstrapDraft {
  return {
    title: "",
    description: "",
    targetAudience: "",
    commercialTags: [],
    bookSellingPoint: "",
    competingFeel: "",
    first30ChapterPromise: "",
    characters: [],
    worldDraft: null,
  };
}

export default function NovelCreateFromOutline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("paste");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"auto" | "template" | "ai">("auto");
  const [parsed, setParsed] = useState<ParsedChapterOutline | null>(null);
  const [bootstrap, setBootstrap] = useState<OutlineCreateBootstrapDraft>(emptyBootstrap);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usedAiForParse, setUsedAiForParse] = useState(false);
  const [commercialTagsText, setCommercialTagsText] = useState("");

  const totalChapters = useMemo(() => parsed?.chapterCount ?? 0, [parsed]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await previewCreateNovelFromOutline({ text, mode });
      if (!response.success || !response.data) {
        throw new Error(response.message || "生成开书草稿失败。");
      }
      return response.data;
    },
    onSuccess: (data) => {
      setParsed(data.parsed);
      setBootstrap(data.bootstrap);
      setCommercialTagsText((data.bootstrap.commercialTags ?? []).join("、"));
      setWarnings(data.warnings ?? []);
      setUsedAiForParse(data.usedAiForParse);
      setStep("review");
      toast.success(
        `已抽出开书草稿：${data.parsed.chapterCount} 章、${data.bootstrap.characters.length} 个角色候选`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "生成开书草稿失败。");
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) {
        throw new Error("请先生成开书草稿。");
      }
      const tags = commercialTagsText
        .split(/[,，、\s]+/u)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6);
      const response = await createNovelFromOutline({
        parsed,
        bootstrap: {
          ...bootstrap,
          commercialTags: tags,
        },
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || "从大纲开书失败。");
      }
      return response.data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      const parts = [
        `已创建「${data.novel.title}」`,
        data.createdCharacterCount > 0 ? `角色 ${data.createdCharacterCount} 个` : null,
        data.hasWorld ? "已绑定世界观草稿" : null,
      ].filter(Boolean);
      toast.success(parts.join(" · "));
      if ((data.warnings ?? []).length > 0) {
        toast.error(`部分步骤未完成：${data.warnings.slice(0, 2).join("；")}`);
      }
      const search = new URLSearchParams();
      search.set("stage", "structured");
      if (data.workflowTaskId) {
        search.set("workspaceTaskId", data.workflowTaskId);
      }
      navigate(`/novels/${data.novel.id}/edit?${search.toString()}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "从大纲开书失败。");
    },
  });

  const patchBootstrap = (patch: Partial<OutlineCreateBootstrapDraft>) => {
    setBootstrap((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-3 py-4 sm:px-4 lg:px-0">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">从大纲开书</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            粘贴你已有的章节大纲，系统会先抽出书名、简介、角色和世界观草稿供你确认，再一键创建小说、写入拆章，并补齐宏观规划与卷节奏。确认开书可能需要一两分钟。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/novels/create">手动创建</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/novels/auto-director">AI 自动导演开书</Link>
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className={step === "paste" ? "font-medium text-foreground" : ""}>1. 粘贴并生成草稿</span>
        <span aria-hidden="true">→</span>
        <span className={step === "review" ? "font-medium text-foreground" : ""}>2. 核对后开书</span>
      </div>

      {step === "paste" ? (
        <section className="space-y-4 rounded-2xl border p-4">
          <div className="rounded-xl bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">推荐格式示例</div>
            <pre className="whitespace-pre-wrap font-sans">{CHAPTER_OUTLINE_IMPORT_TEMPLATE}</pre>
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium">大纲文本</span>
            <textarea
              className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="粘贴你的章节大纲……"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">章节解析方式</legend>
            {(
              [
                ["auto", "自动", "优先按模板原样抽取；识别不清时再用 AI 只做格式整理。"],
                ["template", "仅模板", "按标题规则原样抽取，不调用 AI。"],
                ["ai", "AI 整理", "只允许改格式/拆字段，禁止润色剧情原文。"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="create-from-outline-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!text.trim() || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "生成中..." : "生成开书草稿"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setText(CHAPTER_OUTLINE_IMPORT_TEMPLATE)}
            >
              填入示例模板
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            这一步会调用 AI 抽出设定草稿，通常需要数十秒。
          </p>
        </section>
      ) : (
        <section className="space-y-5">
          {warnings.length > 0 ? (
            <ul className="list-disc space-y-1 rounded-xl bg-amber-50 px-4 py-3 pl-8 text-xs text-amber-900">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-3 rounded-2xl border p-4">
            <div className="text-sm font-medium">基础信息</div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">书名</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2"
                value={bootstrap.title}
                onChange={(event) => patchBootstrap({ title: event.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">简介</span>
              <textarea
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2"
                value={bootstrap.description}
                onChange={(event) => patchBootstrap({ description: event.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">目标读者</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={bootstrap.targetAudience}
                  onChange={(event) => patchBootstrap({ targetAudience: event.target.value })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">商业标签</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={commercialTagsText}
                  onChange={(event) => setCommercialTagsText(event.target.value)}
                  placeholder="用顿号或逗号分隔"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">核心卖点</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={bootstrap.bookSellingPoint}
                  onChange={(event) => patchBootstrap({ bookSellingPoint: event.target.value })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">竞品体感</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={bootstrap.competingFeel}
                  onChange={(event) => patchBootstrap({ competingFeel: event.target.value })}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">前 30 章承诺</span>
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2"
                value={bootstrap.first30ChapterPromise}
                onChange={(event) => patchBootstrap({ first30ChapterPromise: event.target.value })}
              />
            </label>
          </div>

          <div className="space-y-3 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">章节预览 · 共 {totalChapters} 章</div>
              <div className="text-xs text-muted-foreground">
                {usedAiForParse ? "章节来源：AI 整理" : "章节来源：模板解析"}
                {" · 开书后写入拆章并同步执行区章节壳"}
              </div>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto text-sm">
              {(parsed?.volumes ?? []).map((volume, volumeIndex) => (
                <div key={`${volume.title}-${volumeIndex}`}>
                  <div className="font-medium">{volume.title || `第${volumeIndex + 1}卷`}</div>
                  <ol className="mt-1 list-decimal space-y-2 pl-5 text-muted-foreground">
                    {volume.chapters.map((chapter, chapterIndex) => (
                      <li key={`${chapter.title}-${chapterIndex}`}>
                        <span className="text-foreground">{chapter.title}</span>
                        {chapter.summary ? (
                          <span className="mt-0.5 block text-xs">
                            <span className="text-foreground/70">摘要：</span>
                            {chapter.summary}
                          </span>
                        ) : null}
                        {chapter.purpose ? (
                          <span className="mt-0.5 block text-xs">
                            <span className="text-foreground/70">目标：</span>
                            {chapter.purpose}
                          </span>
                        ) : null}
                        {chapter.taskSheet ? (
                          <span className="mt-0.5 block whitespace-pre-wrap text-xs">
                            <span className="text-foreground/70">任务单：</span>
                            {chapter.taskSheet}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border p-4">
            <div className="text-sm font-medium">
              角色草稿 · 勾选要创建的角色
            </div>
            {bootstrap.characters.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前没有可创建的角色草稿，开书后可到角色页再补。</p>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {bootstrap.characters.map((character, index) => (
                  <label key={`${character.name}-${index}`} className="flex items-start gap-3 rounded-xl bg-muted/20 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={character.selected !== false}
                      onChange={(event) => {
                        const next = [...bootstrap.characters];
                        next[index] = { ...character, selected: event.target.checked };
                        patchBootstrap({ characters: next });
                      }}
                    />
                    <span className="space-y-1">
                      <span className="block font-medium">
                        {character.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{character.role}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">{character.personality}</span>
                      <span className="block text-xs text-muted-foreground">{character.background}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border p-4">
            <div className="text-sm font-medium">世界观草稿</div>
            {bootstrap.worldDraft?.sourceText ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{bootstrap.worldDraft.title}</div>
                <p className="text-muted-foreground">{bootstrap.worldDraft.coverSummary}</p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                  {bootstrap.worldDraft.sourceText}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">未抽出可用世界观，开书时将跳过，之后可在世界页补充。</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => setStep("paste")}
            >
              返回修改大纲
            </Button>
            <Button
              type="button"
              disabled={!bootstrap.title.trim() || !parsed || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "开书中..." : "确认开书"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            确认后会创建小说、写入拆章与节奏板、生成宏观规划草稿、创建勾选角色，并尽量写入世界观。局部失败不会撤销整本书。
          </p>
        </section>
      )}
    </div>
  );
}
