import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CHAPTER_OUTLINE_IMPORT_TEMPLATE,
  mergeImportedOutlineIntoVolumes,
  type ParsedChapterOutline,
} from "@ai-novel/shared/utils/outlineImport";
import { applyOutlineImportConflictChoices } from "@ai-novel/shared/utils/outlineImportConflictApply";
import type { VolumePlan } from "@ai-novel/shared/types/novel";
import type {
  OutlineImportConflictAnalysisResult,
  OutlineImportConflictChoice,
  OutlineImportConflictItem,
  OutlineImportPendingAlignmentItem,
} from "@ai-novel/shared/types/outlineImportConflict";
import {
  OUTLINE_IMPORT_CONFLICT_CATEGORY_LABELS,
  OUTLINE_IMPORT_CONFLICT_CHOICE_LABELS,
} from "@ai-novel/shared/types/outlineImportConflict";
import {
  analyzeNovelVolumeOutlineConflicts,
  importNovelVolumeOutline,
  type VolumeOutlineImportMode,
} from "@/api/novel/volumes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { saveOutlineImportPendingAlignments } from "./outlineImportPendingStorage";

type OutlineImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: string;
  volumes: VolumePlan[];
  onApply: (
    volumes: VolumePlan[],
    options?: { pendingAlignments: OutlineImportPendingAlignmentItem[] },
  ) => void;
};

type DialogStep = "parse" | "conflicts";

function buildDefaultChoices(
  conflicts: OutlineImportConflictItem[],
): Record<string, OutlineImportConflictChoice> {
  const next: Record<string, OutlineImportConflictChoice> = {};
  for (const conflict of conflicts) {
    next[conflict.conflictId] = conflict.recommendedChoice;
  }
  return next;
}

export default function OutlineImportDialog(props: OutlineImportDialogProps) {
  const { open, onOpenChange, novelId, volumes, onApply } = props;
  const [step, setStep] = useState<DialogStep>("parse");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<VolumeOutlineImportMode>("auto");
  const [preview, setPreview] = useState<ParsedChapterOutline | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<OutlineImportConflictAnalysisResult | null>(null);
  const [choices, setChoices] = useState<Record<string, OutlineImportConflictChoice>>({});

  const totalChapters = useMemo(
    () => preview?.chapterCount ?? 0,
    [preview],
  );

  const parseMutation = useMutation({
    mutationFn: async () => {
      const response = await importNovelVolumeOutline(novelId, {
        text,
        mode,
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || "大纲解析失败。");
      }
      return response.data;
    },
    onSuccess: (data) => {
      setPreview(data.parsed);
      setUsedAi(data.usedAi);
      setWarnings(data.warnings ?? []);
      setAnalysis(null);
      setChoices({});
      setStep("parse");
      toast.success(
        data.usedAi
          ? `已用 AI 整理出 ${data.parsed.chapterCount} 章，请确认后检查设定冲突`
          : `已识别 ${data.parsed.chapterCount} 章，请确认后检查设定冲突`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "大纲解析失败。");
    },
  });

  const conflictMutation = useMutation({
    mutationFn: async () => {
      if (!preview) {
        throw new Error("请先解析大纲。");
      }
      const response = await analyzeNovelVolumeOutlineConflicts(novelId, {
        parsed: preview,
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || "设定冲突分析失败。");
      }
      return response.data;
    },
    onSuccess: (data) => {
      setAnalysis(data);
      setChoices(buildDefaultChoices(data.conflicts));
      setStep("conflicts");
      if (data.conflicts.length === 0) {
        toast.success("未发现与现有设定的明显冲突，可以直接写入草稿。");
      } else {
        toast.success(`发现 ${data.conflicts.length} 条设定冲突，请逐条选择跟哪一边。`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "设定冲突分析失败。");
    },
  });

  const resetTransientState = () => {
    setPreview(null);
    setWarnings([]);
    setUsedAi(false);
    setAnalysis(null);
    setChoices({});
    setStep("parse");
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetTransientState();
    }
    onOpenChange(nextOpen);
  };

  const handleApply = () => {
    if (!preview || preview.chapterCount < 1) {
      toast.error("请先解析并确认有可用章节。");
      return;
    }
    try {
      const merged = mergeImportedOutlineIntoVolumes(volumes, preview, {
        novelId,
      });
      const conflicts = analysis?.conflicts ?? [];
      const applied = applyOutlineImportConflictChoices({
        volumes: merged,
        conflicts,
        choices,
      });
      saveOutlineImportPendingAlignments(novelId, applied.pendingAlignments);
      onApply(applied.volumes, { pendingAlignments: applied.pendingAlignments });
      if (conflicts.length === 0) {
        toast.success("已写入卷草稿。未发现设定冲突。请点「保存卷工作区」同步到执行区。");
      } else if (applied.pendingAlignments.length > 0) {
        toast.success(
          `已写入卷草稿，另有 ${applied.pendingAlignments.length} 条设定待对齐。请点「保存卷工作区」同步到执行区。`,
        );
      } else {
        toast.success("已写入卷草稿，冲突章节已加上须符合设定的备注。请点「保存卷工作区」同步到执行区。");
      }
      handleClose(false);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "写入草稿失败。");
    }
  };

  const setAllChoices = (choice: OutlineImportConflictChoice) => {
    if (!analysis) {
      return;
    }
    const next: Record<string, OutlineImportConflictChoice> = {};
    for (const conflict of analysis.conflicts) {
      next[conflict.conflictId] = choice;
    }
    setChoices(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "parse" ? "导入章节大纲" : "设定冲突检查"}
          </DialogTitle>
          <DialogDescription>
            {step === "parse"
              ? "把外部大纲粘贴进来，先预览再检查是否与现有角色、世界观、卷战略、节奏板冲突。确认后会替换本书卷工作区里的章节清单；已有正文默认保留，保存时再同步执行区。AI 整理只调整结构格式，不改写剧情原文。"
              : "逐条选择跟设定、跟大纲，或稍后处理。拆章仍会按导入结果覆盖；选择不会静默改角色卡或世界库。"}
          </DialogDescription>
        </DialogHeader>

        {step === "parse" ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">推荐格式示例</div>
              <pre className="whitespace-pre-wrap font-sans">{CHAPTER_OUTLINE_IMPORT_TEMPLATE}</pre>
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium">大纲文本</span>
              <textarea
                className="min-h-48 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setPreview(null);
                  setAnalysis(null);
                  setStep("parse");
                }}
                placeholder="粘贴你的章节大纲……"
              />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">解析方式</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="outline-import-mode"
                  checked={mode === "auto"}
                  onChange={() => setMode("auto")}
                />
                <span>
                  <span className="font-medium">自动</span>
                  <span className="block text-xs text-muted-foreground">优先按模板原样抽取；识别不清时再用 AI 只做格式整理。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="outline-import-mode"
                  checked={mode === "template"}
                  onChange={() => setMode("template")}
                />
                <span>
                  <span className="font-medium">仅模板</span>
                  <span className="block text-xs text-muted-foreground">按标题规则原样抽取字段，不调用 AI，内容不做改写。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="outline-import-mode"
                  checked={mode === "ai"}
                  onChange={() => setMode("ai")}
                />
                <span>
                  <span className="font-medium">AI 整理</span>
                  <span className="block text-xs text-muted-foreground">只允许改格式/拆字段，禁止润色或改写剧情原文。</span>
                </span>
              </label>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!text.trim() || parseMutation.isPending}
                onClick={() => parseMutation.mutate()}
              >
                {parseMutation.isPending ? "解析中..." : "解析预览"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setText(CHAPTER_OUTLINE_IMPORT_TEMPLATE)}
              >
                填入示例模板
              </Button>
            </div>

            {preview ? (
              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">预览：共 {totalChapters} 章</span>
                  <span className="text-xs text-muted-foreground">
                    {usedAi ? "来源：AI 整理" : "来源：模板解析"}
                    {preview.hasVolumeMarkers ? " · 含卷标记" : " · 将写入第 1 卷"}
                  </span>
                </div>
                {warnings.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="max-h-56 space-y-3 overflow-y-auto text-sm">
                  {preview.volumes.map((volume, volumeIndex) => (
                    <div key={`${volume.title}-${volumeIndex}`}>
                      <div className="font-medium">{volume.title || `第${volumeIndex + 1}卷`}</div>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                        {volume.chapters.map((chapter, chapterIndex) => (
                          <li key={`${chapter.title}-${chapterIndex}`}>
                            <span className="text-foreground">{chapter.title}</span>
                            {chapter.summary ? (
                              <span className="block text-xs">{chapter.summary}</span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-destructive">
                  下一步写入后，将替换当前卷工作区中的章节清单。
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {analysis ? (
              <>
                <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  对照快照：角色 {analysis.settingSnapshotSummary.characterCount} 个
                  {" · "}
                  世界观 {analysis.settingSnapshotSummary.hasWorld ? "已有" : "未建"}
                  {" · "}
                  卷战略 {analysis.settingSnapshotSummary.hasStrategyPlan ? "已有" : "未建"}
                  {" · "}
                  节奏板 {analysis.settingSnapshotSummary.beatSheetCount} 份
                </div>

                {analysis.conflicts.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    未发现与现有设定的明显冲突。可以直接把大纲写入草稿。
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setAllChoices("keep_outline")}>
                        全部跟大纲
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAllChoices("keep_setting")}>
                        全部跟设定
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAllChoices("defer")}>
                        全部稍后处理
                      </Button>
                    </div>
                    <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                      {analysis.conflicts.map((conflict) => (
                        <ConflictChoiceCard
                          key={conflict.conflictId}
                          conflict={conflict}
                          choice={choices[conflict.conflictId] ?? conflict.recommendedChoice}
                          onChange={(next) => {
                            setChoices((prev) => ({
                              ...prev,
                              [conflict.conflictId]: next,
                            }));
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            取消
          </Button>
          {step === "conflicts" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={conflictMutation.isPending}
              onClick={() => setStep("parse")}
            >
              返回预览
            </Button>
          ) : null}
          {step === "parse" ? (
            <Button
              type="button"
              disabled={!preview || totalChapters < 1 || parseMutation.isPending || conflictMutation.isPending}
              onClick={() => conflictMutation.mutate()}
            >
              {conflictMutation.isPending ? "分析中..." : "检查设定冲突"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!preview || totalChapters < 1 || conflictMutation.isPending}
              onClick={handleApply}
            >
              写入草稿
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConflictChoiceCard(props: {
  conflict: OutlineImportConflictItem;
  choice: OutlineImportConflictChoice;
  onChange: (choice: OutlineImportConflictChoice) => void;
}) {
  const { conflict, choice, onChange } = props;
  const radioName = `outline-conflict-${conflict.conflictId}`;

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{conflict.title}</span>
        <span className="text-xs text-muted-foreground">
          {OUTLINE_IMPORT_CONFLICT_CATEGORY_LABELS[conflict.category]}
          {" · "}
          {conflict.severity === "blocking" ? "需优先处理" : "提醒"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{conflict.summary}</p>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-2">
          <div className="mb-1 font-medium text-foreground">现有设定 · {conflict.settingRef.label}</div>
          <p className="whitespace-pre-wrap text-muted-foreground">{conflict.settingRef.excerpt}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2">
          <div className="mb-1 font-medium text-foreground">
            导入大纲
            {conflict.outlineRef.chapterTitle
              ? ` · ${conflict.outlineRef.chapterTitle}`
              : conflict.outlineRef.chapterOrder
                ? ` · 第${conflict.outlineRef.chapterOrder}章`
                : ""}
          </div>
          <p className="whitespace-pre-wrap text-muted-foreground">{conflict.outlineRef.excerpt}</p>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground">
          建议：{OUTLINE_IMPORT_CONFLICT_CHOICE_LABELS[conflict.recommendedChoice]}
        </legend>
        {(["keep_setting", "keep_outline", "defer"] as const).map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={radioName}
              checked={choice === value}
              onChange={() => onChange(value)}
            />
            <span>
              <span className="font-medium">{OUTLINE_IMPORT_CONFLICT_CHOICE_LABELS[value]}</span>
              <span className="block text-xs text-muted-foreground">
                {value === "keep_setting"
                  ? "拆章仍覆盖，相关章节会加上「须符合既有设定」备注。"
                  : value === "keep_outline"
                    ? "保留导入原文，并把这条记为设定待对齐。"
                    : "先写入拆章，这条冲突稍后处理，不阻断保存。"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
