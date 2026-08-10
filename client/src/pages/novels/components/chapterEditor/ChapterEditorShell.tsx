import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterEditorDiagnosticCard,
  ChapterEditorOperation,
  ChapterEditorRecommendedTask,
  ChapterEditorRevisionScope,
  ChapterEditorTargetRange,
} from "@ai-novel/shared/types/novel";
import {
  createNovelSnapshot,
  previewChapterAiRevision,
  updateNovelChapter,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import {
  buildWordCountHint,
  confirmLeaveUnsavedEditor,
  type ChapterEditorMobilePane,
} from "./chapterEditorPageHelpers";
import { useChapterEditorAiWritingDetectActions } from "./hooks/useChapterEditorAiWritingDetectActions";
import { useChapterEditorAuditActions } from "./hooks/useChapterEditorAuditActions";
import { useChapterEditorPersistActions } from "./hooks/useChapterEditorPersistActions";
import { useChapterEditorWritingAssistActions } from "./hooks/useChapterEditorWritingAssistActions";
import ChapterEditorShellLayout from "./write/ChapterEditorShellLayout";
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
  getSyncStatusLabel,
  normalizeChapterContent,
  type ChapterEditorPersistStatus,
  type ChapterEditorSyncStatus,
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
    chapter,
    previousChapter = null,
    nextChapter = null,
    workspace,
    workspaceStatus,
    onBack,
    onOpenVersionHistory,
    onGoChapter,
  } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const lastPreviewRequestRef = useRef<ReturnType<typeof buildAiRevisionRequest> | null>(null);
  const normalizedChapterContent = useMemo(() => normalizeChapterContent(chapter?.content ?? ""), [chapter?.content]);

  const [contentDraft, setContentDraft] = useState(normalizedChapterContent);
  const [savedContent, setSavedContent] = useState(normalizedChapterContent);
  const [syncedContent, setSyncedContent] = useState(normalizedChapterContent);
  const [saveStatus, setSaveStatus] = useState<ChapterEditorPersistStatus>("idle");
  const [syncStatus, setSyncStatus] = useState<ChapterEditorSyncStatus>("idle");
  const [selection, setSelection] = useState<ChapterEditorSelectionRange | null>(null);
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<SelectionToolbarPosition | null>(null);
  const [session, setSession] = useState<ChapterEditorSessionState>(EMPTY_SESSION);
  const [revisionScope, setRevisionScope] = useState<ChapterEditorRevisionScope>("selection");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<ChapterEditorMobilePane>("write");
  const [focusMode, setFocusMode] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiDetectOpen, setAiDetectOpen] = useState(false);
  const [appendCandidateOnAccept, setAppendCandidateOnAccept] = useState(false);

  useEffect(() => {
    const nextContent = normalizedChapterContent;
    setContentDraft(nextContent);
    setSavedContent(nextContent);
    setSyncedContent(nextContent);
    setSaveStatus("idle");
    setSyncStatus("idle");
    setSelection(null);
    setSelectionToolbarPosition(null);
    setSession(EMPTY_SESSION);
    setRevisionInstruction("");
    setRevisionScope("selection");
    lastPreviewRequestRef.current = null;
    setAppendCandidateOnAccept(false);
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

  useEffect(() => {
    if (session.status !== "idle") {
      setAiPanelOpen(true);
    }
  }, [session.status]);

  const isDirty = contentDraft !== savedContent;
  const needsSync = contentDraft !== syncedContent;
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

  const {
    auditResult,
    auditErrorMessage,
    fullAuditMutation,
    lightAuditMutation,
    resolveIssueMutation,
  } = useChapterEditorAuditActions({
    novelId,
    chapter,
    contentDraft,
    selection,
    llm: {
      provider: llm.provider,
      model: llm.model,
    },
    onInvalidateRelated: invalidateChapterQueries,
    resetToken: chapter?.id ?? "none",
  });

  const {
    aiWritingDetectResult,
    aiWritingDetectErrorMessage,
    aiWritingDetectMutation,
  } = useChapterEditorAiWritingDetectActions({
    novelId,
    chapter,
    contentDraft,
    llm: {
      provider: llm.provider,
      model: llm.model,
    },
    resetToken: chapter?.id ?? "none",
  });

  const { saveMutation, syncSaveMutation } = useChapterEditorPersistActions({
    novelId,
    chapter,
    contentDraft,
    savedContent,
    setSavedContent,
    setSyncedContent,
    setSaveStatus,
    setSyncStatus,
    onSynced: invalidateChapterQueries,
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
      const nextContent = appendCandidateOnAccept
        ? `${normalizeChapterContent(contentDraft).trimEnd()}\n\n${activeCandidate.content.trim()}`
        : applyCandidateToContent(contentDraft, session.targetRange, activeCandidate.content);
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
      setSyncedContent(nextContent);
      setSaveStatus("saved");
      setSyncStatus("synced");
      setSession(EMPTY_SESSION);
      setRevisionInstruction("");
      setAppendCandidateOnAccept(false);
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
    setAppendCandidateOnAccept(false);
    runRevision("freeform", revisionScope, {
      instruction: revisionInstruction.trim(),
    });
  };

  const {
    handleLocateRange,
    handleStuckDirection,
    handleLocateAuditIssue,
    handleFixAuditIssue,
  } = useChapterEditorWritingAssistActions({
    contentDraft,
    selection,
    runRevision,
    setSelection,
    setSelectedDiagnosticId,
    setRevisionScope,
    setRevisionInstruction,
    setAppendCandidateOnAccept,
    setMobilePane,
    setFocusMode,
  });

  const requestLeave = (action: () => void) => {
    if (!confirmLeaveUnsavedEditor(isDirty)) {
      return;
    }
    action();
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typingInField = tag === "input" || tag === "textarea" || Boolean(target?.isContentEditable);

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isDirty && !saveMutation.isPending && !syncSaveMutation.isPending) {
          saveMutation.mutate(contentDraft);
        }
        return;
      }

      if (event.key === "Enter") {
        if (typingInField && tag !== "textarea") {
          return;
        }
        event.preventDefault();
        if (session.status === "ready" && activeCandidate && !acceptMutation.isPending) {
          acceptMutation.mutate();
          return;
        }
        if (session.status !== "idle" || previewMutation.isPending) {
          return;
        }
        if (revisionInstruction.trim()) {
          handleRunFreeform();
          return;
        }
        if (workspace?.recommendedTask) {
          handleRunRecommended();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
  if (!chapter) {
    return null;
  }

  const headerSaveLabel = getSaveStatusLabel(saveStatus, isDirty);
  const headerSyncLabel = getSyncStatusLabel(syncStatus, needsSync);
  const wordHint = buildWordCountHint(wordCount, chapter.targetWordCount);
  const showGuidePane = !focusMode && mobilePane === "guide";
  const showWritePane = focusMode || mobilePane === "write";
  const showAiPane = !focusMode && mobilePane === "ai";
  const desktopGridClassName = focusMode
    ? "xl:grid-cols-[minmax(0,1fr)]"
    : aiPanelOpen
      ? "xl:grid-cols-[320px_minmax(0,1fr)_400px]"
      : "xl:grid-cols-[320px_minmax(0,1fr)]";

  return (
    <ChapterEditorShellLayout
      novelId={novelId}
      chapter={chapter}
      previousChapter={previousChapter}
      nextChapter={nextChapter}
      workspace={workspace}
      workspaceStatus={workspaceStatus}
      focusMode={focusMode}
      mobilePane={mobilePane}
      aiPanelOpen={aiPanelOpen}
      aiDetectOpen={aiDetectOpen}
      desktopGridClassName={desktopGridClassName}
      showGuidePane={showGuidePane}
      showWritePane={showWritePane}
      showAiPane={showAiPane}
      wordCount={wordCount}
      wordCountLabel={wordHint.chipLabel}
      wordCountDetail={wordHint.detail}
      saveStatusLabel={headerSaveLabel}
      syncStatusLabel={headerSyncLabel}
      isDirty={isDirty}
      needsSync={needsSync}
      openIssueCount={workspace?.chapterMeta.openIssueCount ?? 0}
      isSaving={saveMutation.isPending}
      isSyncing={syncSaveMutation.isPending}
      contentDraft={contentDraft}
      selection={selection}
      selectionToolbarPosition={selectionToolbarPosition}
      selectedDiagnosticId={selectedDiagnosticId}
      selectedDiagnosticCard={selectedDiagnosticCard}
      canRunAudit={Boolean(contentDraft.trim())}
      isRunningFullAudit={fullAuditMutation.isPending}
      isRunningLightAudit={lightAuditMutation.isPending}
      isResolvingIssue={resolveIssueMutation.isPending}
      auditResult={auditResult}
      auditErrorMessage={auditErrorMessage}
      aiWritingDetectResult={aiWritingDetectResult}
      aiWritingDetectErrorMessage={aiWritingDetectErrorMessage}
      isRunningAiWritingDetect={aiWritingDetectMutation.isPending}
      session={session}
      activeCandidate={activeCandidate}
      revisionScope={revisionScope}
      revisionInstruction={revisionInstruction}
      canRunSelectionRevision={canRunSelectionRevision}
      currentTargetDescription={currentTargetDescription}
      isGenerating={previewMutation.isPending}
      isApplying={acceptMutation.isPending}
      preview={previewPayload}
      focusRange={session.status === "idle"
        ? selection
          ? { from: selection.from, to: selection.to }
          : selectedDiagnosticCard?.anchorRange ?? null
        : null}
      onToggleFocusMode={() => {
        setFocusMode((current) => {
          const next = !current;
          if (next) {
            setMobilePane("write");
          }
          return next;
        });
      }}
      onSetMobilePane={setMobilePane}
      onToggleAiPanel={() => setAiPanelOpen((current) => !current)}
      onCollapseAiPanel={() => setAiPanelOpen(false)}
      onToggleAiDetect={() => setAiDetectOpen((current) => !current)}
      onSave={() => saveMutation.mutate(contentDraft)}
      onSyncSave={() => syncSaveMutation.mutate(contentDraft)}
      onRunAiWritingDetect={() => {
        setAiDetectOpen(true);
        aiWritingDetectMutation.mutate();
      }}
      onBack={onBack ? () => requestLeave(onBack) : undefined}
      onOpenVersionHistory={onOpenVersionHistory
        ? () => requestLeave(onOpenVersionHistory)
        : undefined}
      onGoPreviousChapter={previousChapter && onGoChapter
        ? () => requestLeave(() => onGoChapter(previousChapter.id))
        : undefined}
      onGoNextChapter={nextChapter && onGoChapter
        ? () => requestLeave(() => onGoChapter(nextChapter.id))
        : undefined}
      onRunFullAudit={() => fullAuditMutation.mutate()}
      onRunLightAudit={() => lightAuditMutation.mutate()}
      onResolveAuditIssue={(issueId) => resolveIssueMutation.mutate(issueId)}
      onLocateAuditIssue={handleLocateAuditIssue}
      onFixAuditIssue={handleFixAuditIssue}
      onStuckDirection={handleStuckDirection}
      onLocateRange={handleLocateRange}
      onRefreshAfterRestore={invalidateChapterQueries}
      onFocusDiagnostic={handleFocusDiagnostic}
      onRunDiagnostic={handleRunDiagnostic}
      onContentChange={(next) => {
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
      onRunSelectionOperation={handleRunOperation}
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
}
