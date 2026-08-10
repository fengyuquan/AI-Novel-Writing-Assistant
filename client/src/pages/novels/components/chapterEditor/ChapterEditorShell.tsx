import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterEditorDiagnosticCard,
  ChapterEditorOperation,
  ChapterEditorRecommendedTask,
  ChapterEditorRevisionScope,
  ChapterEditorTargetRange,
} from "@ai-novel/shared/types/novel";
import { createNovelSnapshot, previewChapterAiRevision, updateNovelChapter } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import MobileScrollEdgeButtons from "@/components/layout/mobile/MobileScrollEdgeButtons";
import MobileNovelWorkspaceNavMenu from "@/pages/novels/mobile/MobileNovelWorkspaceNavMenu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import { ChevronLeft, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import ChapterEditorDirectorPanel from "./ChapterEditorDirectorPanel";
import ChapterEditorSidebar from "./ChapterEditorSidebar";
import ChapterTextEditor from "./ChapterTextEditor";
import MobileChapterRewriteActionBar from "./MobileChapterRewriteActionBar";
import SelectionAIFloatingToolbar from "./SelectionAIFloatingToolbar";
import type {
  ChapterEditorSelectionRange,
  ChapterEditorSessionState,
  ChapterEditorShellProps,
  SelectionToolbarPosition,
} from "./chapterEditorTypes";
import {
  CHAPTER_EDITOR_OPERATION_LABELS,
  applyCandidateToContent,
  buildAiRevisionRequest,
  countEditorWords,
  getSaveStatusLabel,
  normalizeChapterContent,
} from "./chapterEditorUtils";

const EMPTY_SESSION: ChapterEditorSessionState = {
  sessionId: "",
  scope: "selection",
  targetRange: {
    from: 0,
    to: 0,
    text: "",
  },
  candidates: [],
  activeCandidateId: null,
  status: "idle",
  viewMode: "block",
};

function toSelectionFromRange(
  content: string,
  range?: Pick<ChapterEditorTargetRange, "from" | "to"> | null,
): ChapterEditorSelectionRange | null {
  if (!range) {
    return null;
  }
  if (range.from < 0 || range.to <= range.from || range.to > content.length) {
    return null;
  }
  const text = content.slice(range.from, range.to);
  if (!text.trim()) {
    return null;
  }
  return {
    from: range.from,
    to: range.to,
    text,
  };
}

export default function ChapterEditorShell(props: ChapterEditorShellProps) {
  const {
    novelId,
    novelTitle,
    chapter,
    chapters = [],
    workspace,
    workspaceStatus,
    onBack,
    onOpenVersionHistory,
    onNavigateChapter,
  } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const isMobileViewport = useIsMobileViewport();
  const [assistSheet, setAssistSheet] = useState<"info" | "ai" | null>(null);
  const lastPreviewRequestRef = useRef<ReturnType<typeof buildAiRevisionRequest> | null>(null);
  const normalizedChapterContent = useMemo(() => normalizeChapterContent(chapter?.content ?? ""), [chapter?.content]);

  const [contentDraft, setContentDraft] = useState(normalizedChapterContent);
  const [savedContent, setSavedContent] = useState(normalizedChapterContent);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selection, setSelection] = useState<ChapterEditorSelectionRange | null>(null);
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<SelectionToolbarPosition | null>(null);
  const [session, setSession] = useState<ChapterEditorSessionState>(EMPTY_SESSION);
  const [revisionScope, setRevisionScope] = useState<ChapterEditorRevisionScope>("selection");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | null>(null);

  useEffect(() => {
    // Keep the body visible while comparing: close the instruct sheet once rewrite starts.
    if (session.status === "loading" || session.status === "ready" || session.status === "error") {
      setAssistSheet((current) => (current === "ai" ? null : current));
    }
  }, [session.status]);

  useEffect(() => {
    const nextContent = normalizedChapterContent;
    setContentDraft(nextContent);
    setSavedContent(nextContent);
    setSaveStatus("idle");
    setSelection(null);
    setSelectionToolbarPosition(null);
    setSession(EMPTY_SESSION);
    setRevisionInstruction("");
    setRevisionScope("selection");
    lastPreviewRequestRef.current = null;
  }, [chapter?.id, normalizedChapterContent]);

  useEffect(() => {
    if (!workspace) {
      setSelectedDiagnosticId(null);
      return;
    }
    if (selectedDiagnosticId && !workspace.diagnosticCards.some((card) => card.id === selectedDiagnosticId)) {
      setSelectedDiagnosticId(null);
    }
  }, [selectedDiagnosticId, workspace]);

  const isDirty = contentDraft !== savedContent;
  const wordCount = useMemo(() => countEditorWords(contentDraft), [contentDraft]);
  const activeCandidate = useMemo(
    () => session.candidates?.find((candidate) => candidate.id === session.activeCandidateId) ?? null,
    [session.activeCandidateId, session.candidates],
  );
  const selectedDiagnosticCard = useMemo(
    () => workspace?.diagnosticCards.find((card) => card.id === selectedDiagnosticId) ?? null,
    [selectedDiagnosticId, workspace],
  );
  const selectedDiagnosticSelection = useMemo(
    () => toSelectionFromRange(contentDraft, selectedDiagnosticCard?.anchorRange ?? null),
    [contentDraft, selectedDiagnosticCard?.anchorRange],
  );
  const recommendedTaskSelection = useMemo(
    () => toSelectionFromRange(contentDraft, workspace?.recommendedTask?.anchorRange ?? null),
    [contentDraft, workspace?.recommendedTask?.anchorRange],
  );

  const invalidateChapterQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapter?.id ?? "none") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) }),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, chapter.id) })
        : Promise.resolve(),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, chapter.id) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(novelId) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (nextContent: string) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return updateNovelChapter(novelId, chapter.id, { content: nextContent });
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: async (_response, nextContent) => {
      setSavedContent(nextContent);
      setSaveStatus("saved");
      await invalidateChapterQueries();
      toast.success("章节正文已保存。");
    },
    onError: (error) => {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : "章节保存失败。");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (request: ReturnType<typeof buildAiRevisionRequest>) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return previewChapterAiRevision(novelId, chapter.id, request);
    },
    onMutate: (request) => {
      lastPreviewRequestRef.current = request;
      const label = request.source === "freeform"
        ? (request.scope === "chapter" ? "正在生成整章自然语言修正方案" : "正在按你的意见改写片段")
        : request.presetOperation
          ? `正在生成${CHAPTER_EDITOR_OPERATION_LABELS[request.presetOperation]}方案`
          : "正在生成修正方案";
      setSession((current) => ({
        ...current,
        status: "loading",
        requestLabel: label,
        customInstruction: request.instruction,
        scope: request.scope,
        targetRange: request.selection ?? {
          from: 0,
          to: contentDraft.length,
          text: contentDraft,
        },
        candidates: [],
        activeCandidateId: null,
        errorMessage: undefined,
      }));
    },
    onSuccess: (response) => {
      const data = response.data;
      if (!data) {
        setSession((current) => ({
          ...current,
          status: "error",
          errorMessage: "AI 未返回改写结果，请重试。",
        }));
        return;
      }
      setSession((current) => ({
        ...data,
        status: "ready",
        viewMode: "block",
        requestLabel: current.requestLabel,
        errorMessage: undefined,
      }));
      setSelection(null);
      setSelectionToolbarPosition(null);
    },
    onError: (error) => {
      setSession((current) => ({
        ...current,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "AI 修正失败，请重试。",
      }));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!chapter || !activeCandidate || !session.targetRange) {
        throw new Error("当前没有可应用的候选版本。");
      }
      const label = `chapter-editor:${chapter.order}:${session.scope}:${Date.now()}`;
      const nextContent = applyCandidateToContent(contentDraft, session.targetRange, activeCandidate.content);
      await createNovelSnapshot(novelId, {
        triggerType: "manual",
        label,
      });
      await updateNovelChapter(novelId, chapter.id, {
        content: nextContent,
      });
      return nextContent;
    },
    onSuccess: async (nextContent) => {
      setContentDraft(nextContent);
      setSavedContent(nextContent);
      setSaveStatus("saved");
      setSession(EMPTY_SESSION);
      setRevisionInstruction("");
      await invalidateChapterQueries();
      toast.success("已应用候选版本，并创建 AI 修改前快照。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "应用候选版本失败。");
    },
  });

  const previewPayload = session.status === "loading" && session.targetRange?.text
    ? {
      mode: "loading" as const,
      from: session.targetRange.from,
      to: session.targetRange.to,
      originalText: session.targetRange.text,
    }
    : session.status === "ready" && activeCandidate && session.targetRange
      ? {
        mode: session.viewMode,
        from: session.targetRange.from,
        to: session.targetRange.to,
        diffChunks: activeCandidate.diffChunks,
        originalText: session.targetRange.text,
        candidateText: activeCandidate.content,
      }
      : null;

  if (!chapter) {
    return (
      <div className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-10 text-center text-sm text-muted-foreground">
        请选择一个章节后开始编辑正文。
      </div>
    );
  }

  const getSelectionTarget = (
    overrideSelection?: ChapterEditorSelectionRange | null,
    task?: ChapterEditorRecommendedTask | null,
  ) => overrideSelection
    ?? selection
    ?? selectedDiagnosticSelection
    ?? toSelectionFromRange(contentDraft, task?.anchorRange ?? null)
    ?? recommendedTaskSelection
    ?? null;

  const runRevision = (
    source: "preset" | "freeform",
    scope: ChapterEditorRevisionScope,
    options?: {
      presetOperation?: ChapterEditorOperation;
      instruction?: string;
      selectionOverride?: ChapterEditorSelectionRange | null;
      task?: ChapterEditorRecommendedTask | null;
    },
  ) => {
    const resolvedSelection = scope === "selection"
      ? getSelectionTarget(options?.selectionOverride, options?.task)
      : null;

    if (scope === "selection" && !resolvedSelection) {
      toast.error("请先选中正文片段，或先从问题卡定位到对应片段。");
      return;
    }

    const request = buildAiRevisionRequest({
      source,
      scope,
      presetOperation: options?.presetOperation,
      instruction: options?.instruction,
      selection: resolvedSelection,
      content: contentDraft,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
    previewMutation.mutate(request);
  };

  const handleRunOperation = (operation: ChapterEditorOperation, customInstruction?: string) => {
    runRevision(
      operation === "custom" ? "freeform" : "preset",
      "selection",
      {
        presetOperation: operation === "custom" ? undefined : operation,
        instruction: customInstruction,
        selectionOverride: selection,
      },
    );
  };

  const handleRegenerate = () => {
    if (!lastPreviewRequestRef.current) {
      return;
    }
    previewMutation.mutate(lastPreviewRequestRef.current);
  };

  const handleReject = () => {
    setSession(EMPTY_SESSION);
    setSelection(null);
    setSelectionToolbarPosition(null);
  };

  const handleFocusDiagnostic = (card: ChapterEditorDiagnosticCard) => {
    if (selectedDiagnosticId === card.id) {
      setSelectedDiagnosticId(null);
      return;
    }
    setSelectedDiagnosticId(card.id);
    setSelection(null);
    setSelectionToolbarPosition(null);
  };

  const handleRunDiagnostic = (card: ChapterEditorDiagnosticCard) => {
    setSelectedDiagnosticId(card.id);
    runRevision("preset", card.recommendedScope, {
      presetOperation: card.recommendedAction,
      selectionOverride: toSelectionFromRange(contentDraft, card.anchorRange ?? null),
    });
  };

  const handleRunRecommended = () => {
    if (!workspace?.recommendedTask) {
      return;
    }
    runRevision("preset", workspace.recommendedTask.recommendedScope, {
      presetOperation: workspace.recommendedTask.recommendedAction,
      task: workspace.recommendedTask,
    });
  };

  const handleRunSelectedDiagnostic = () => {
    if (!selectedDiagnosticCard) {
      return;
    }
    handleRunDiagnostic(selectedDiagnosticCard);
  };

  const handleRunFreeform = () => {
    runRevision("freeform", revisionScope, {
      instruction: revisionInstruction.trim(),
    });
  };

  const currentTargetDescription = revisionScope === "chapter"
    ? "整章正文"
    : selection
      ? "你手动选中的正文片段"
      : selectedDiagnosticCard?.paragraphLabel
        ? `${selectedDiagnosticCard.paragraphLabel} 对应片段`
        : workspace?.recommendedTask?.paragraphLabel
          ? `${workspace.recommendedTask.paragraphLabel} 对应片段`
          : "尚未选中片段";
  const canRunSelectionRevision = Boolean(getSelectionTarget());
  const headerSaveLabel = getSaveStatusLabel(saveStatus, isDirty);
  const chapterTitle = `第 ${chapter.order} 章 · ${chapter.title?.trim() || "未命名章节"}`;
  const recommendedLabel = workspace?.recommendedTask?.title?.trim() || "按当前推荐继续改写";
  const workspaceNovelTitle = novelTitle?.trim() || "当前小说";
  const orderedChapters = [...chapters].sort((left, right) => left.order - right.order);
  const currentChapterIndex = orderedChapters.findIndex((item) => item.id === chapter.id);
  const previousChapter = currentChapterIndex > 0 ? orderedChapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < orderedChapters.length - 1
    ? orderedChapters[currentChapterIndex + 1]
    : null;

  const handleNavigateChapter = (targetChapterId: string) => {
    if (!onNavigateChapter) {
      return;
    }
    if (isDirty) {
      toast.error("请先保存本章，再切换章节。");
      return;
    }
    onNavigateChapter(targetChapterId);
  };

  const sidebar = (
    <ChapterEditorSidebar
      chapter={chapter}
      workspace={workspace}
      workspaceStatus={workspaceStatus}
      wordCount={wordCount}
      saveStatusLabel={headerSaveLabel}
      isDirty={isDirty}
      isSaving={saveMutation.isPending}
      selectedDiagnosticId={selectedDiagnosticId}
      onBack={onBack}
      onOpenVersionHistory={onOpenVersionHistory}
      onSave={() => saveMutation.mutate(contentDraft)}
      onFocusDiagnostic={handleFocusDiagnostic}
      onRunDiagnostic={handleRunDiagnostic}
    />
  );

  const directorPanel = (
    <ChapterEditorDirectorPanel
      workspace={workspace}
      workspaceStatus={workspaceStatus}
      selectedDiagnosticCard={selectedDiagnosticCard}
      session={session}
      activeCandidate={activeCandidate}
      revisionScope={revisionScope}
      revisionInstruction={revisionInstruction}
      canRunSelectionRevision={canRunSelectionRevision}
      currentTargetDescription={currentTargetDescription}
      isGenerating={previewMutation.isPending}
      isApplying={acceptMutation.isPending}
      onInstructionChange={setRevisionInstruction}
      onScopeChange={setRevisionScope}
      onRunRecommended={handleRunRecommended}
      onRunSelectedDiagnostic={handleRunSelectedDiagnostic}
      onRunFreeform={handleRunFreeform}
      onSelectCandidate={(candidateId) => setSession((current) => ({ ...current, activeCandidateId: candidateId }))}
      onChangeViewMode={(mode) => setSession((current) => ({ ...current, viewMode: mode }))}
      onAccept={() => acceptMutation.mutate()}
      onReject={handleReject}
      onRegenerate={handleRegenerate}
    />
  );

  const textEditor = (
    <div className={isMobileViewport ? "relative min-w-0" : "relative min-h-0 min-w-0 flex-1 overflow-hidden"}>
      <ChapterTextEditor
        value={contentDraft}
        fillHeight={!isMobileViewport}
        readOnly={session.status !== "idle"}
        onChange={(next) => {
          setContentDraft(next);
          setSaveStatus("idle");
        }}
        onSelectionChange={(nextSelection, position) => {
          setSelection(nextSelection);
          setSelectionToolbarPosition(position);
          if (nextSelection) {
            setSelectedDiagnosticId(null);
          }
        }}
        preview={previewPayload}
        focusRange={session.status === "idle"
          ? selection
            ? { from: selection.from, to: selection.to }
            : selectedDiagnosticCard?.anchorRange ?? null
          : null}
      />
      <SelectionAIFloatingToolbar
        visible={Boolean(selection && session.status === "idle" && !isMobileViewport)}
        position={selectionToolbarPosition}
        disabled={previewMutation.isPending}
        onRunOperation={handleRunOperation}
      />
    </div>
  );

  if (isMobileViewport) {
    const showRewriteActionBar = session.status !== "idle" || Boolean(selection);
    const bottomPadClassName = showRewriteActionBar ? "pb-44" : "pb-28";
    const scrollEdgeBottomClassName = showRewriteActionBar
      ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
      : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]";

    return (
      <div className={`mobile-page-chapter-edit w-full max-w-full space-y-3 overflow-x-hidden px-3 pt-3 ${bottomPadClassName}`}>
        <header className="sticky top-0 z-30 space-y-2 rounded-xl border border-border/70 bg-background/95 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <MobileNovelWorkspaceNavMenu
                novelId={novelId}
                novelTitle={workspaceNovelTitle}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{chapterTitle}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {wordCount} 字 · {headerSaveLabel}
                </p>
              </div>
            </div>
            {onBack ? (
              <Button type="button" size="sm" variant="outline" className="h-10 shrink-0" onClick={onBack}>
                返回
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11"
              disabled={!previousChapter || !onNavigateChapter}
              onClick={() => previousChapter && handleNavigateChapter(previousChapter.id)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一章
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11"
              disabled={!nextChapter || !onNavigateChapter}
              onClick={() => nextChapter && handleNavigateChapter(nextChapter.id)}
            >
              下一章
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {workspace?.recommendedTask ? (
            <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              推荐：{recommendedLabel}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11"
              onClick={() => setAssistSheet("info")}
            >
              <ClipboardList className="h-4 w-4" />
              章节信息
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11"
              onClick={() => setAssistSheet("ai")}
            >
              <Sparkles className="h-4 w-4" />
              AI 改写
            </Button>
          </div>
          {session.status === "ready" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
              正文已显示对比结果。在底部选用版本，或点「说明」查看改写意图。
            </p>
          ) : null}
        </header>

        {textEditor}

        {showRewriteActionBar ? (
          <MobileChapterRewriteActionBar
            session={session}
            activeCandidate={activeCandidate}
            hasSelection={Boolean(selection)}
            isGenerating={previewMutation.isPending}
            isApplying={acceptMutation.isPending}
            onRunOperation={(operation) => handleRunOperation(operation)}
            onOpenAiSheet={() => setAssistSheet("ai")}
            onSelectCandidate={(candidateId) => setSession((current) => ({ ...current, activeCandidateId: candidateId }))}
            onAccept={() => acceptMutation.mutate()}
            onReject={handleReject}
            onRegenerate={handleRegenerate}
            onOpenDetails={() => setAssistSheet("ai")}
          />
        ) : (
          <div
            className="fixed left-3 right-3 z-40 rounded-xl border border-border/70 bg-background/95 p-2 shadow-lg"
            style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <Button
              type="button"
              className="h-11 min-h-11 w-full text-base"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate(contentDraft)}
            >
              {saveMutation.isPending ? "保存中..." : isDirty ? "保存本章" : "已是最新"}
            </Button>
          </div>
        )}

        <MobileScrollEdgeButtons bottomOffsetClassName={scrollEdgeBottomClassName} />

        <Sheet open={assistSheet === "info"} onOpenChange={(open) => !open && setAssistSheet(null)}>
          <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 p-0">
            <SheetHeader>
              <SheetTitle>章节信息</SheetTitle>
              <SheetDescription>查看诊断、返回章节执行页，或打开版本历史。</SheetDescription>
            </SheetHeader>
            <SheetBody className="px-3 pb-4">{sidebar}</SheetBody>
          </SheetContent>
        </Sheet>

        <Sheet open={assistSheet === "ai"} onOpenChange={(open) => !open && setAssistSheet(null)}>
          <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 p-0">
            <SheetHeader>
              <SheetTitle>{session.status === "ready" ? "改写说明" : "AI 改写"}</SheetTitle>
              <SheetDescription>
                {session.status === "ready"
                  ? "查看这次改写意图与候选说明。正文对比已留在页面上。"
                  : selection
                    ? "已选中正文片段，可直接按推荐或自定义指令改写。"
                    : "先选中正文，或按整章 / 推荐任务继续改写。"}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="px-3 pb-4">{directorPanel}</SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_400px]">
        {sidebar}
        {textEditor}
        <div className="min-h-0 overflow-hidden">{directorPanel}</div>
      </div>
    </div>
  );
}
