import { useMemo, useState } from "react";
import { List, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildReplanRecommendationFromAuditReports } from "../chapterPlanning.shared";
import type { ChapterTabViewProps } from "../components/NovelEditView.types";
import WorldInjectionHint from "../components/WorldInjectionHint";
import ChapterExecutionActionPanel, {
  resolvePrimaryAction,
} from "../components/ChapterExecutionActionPanel";
import ChapterExecutionInsightsSidebar from "../components/chapterInsights";
import ChapterExecutionReferencePanel from "../components/chapterInsights/ChapterExecutionReferencePanel";
import ChapterExecutionQueueCard from "../components/ChapterExecutionQueueCard";
import ChapterExecutionResultPanel from "../components/ChapterExecutionResultPanel";
import {
  chapterMatchesQueueFilter,
  PrimaryActionButton,
  resolveDisplayedChapterStatus,
  type AssetTabKey,
  type QueueFilterKey,
} from "../components/chapterExecution.shared";
import DirectorTakeoverEntryPanel from "../components/DirectorTakeoverEntryPanel";

type AssistSheet = "queue" | "agent" | "insights" | "reference" | null;

export default function MobileChapterExecutionShell(props: ChapterTabViewProps) {
  const {
    novelId,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter,
    onGoToCharacterTab,
    onCreateChapter,
    isCreatingChapter,
    onRemoveChapter,
    removingChapterId,
    chapterOperationMessage,
    strategy,
    onStrategyChange,
    onApplyStrategy,
    isApplyingStrategy,
    onGenerateSelectedChapter,
    onRewriteChapter,
    onExpandChapter,
    onCompressChapter,
    onSummarizeChapter,
    onGenerateTaskSheet,
    onGenerateSceneCards,
    onGenerateChapterPlan,
    onReplanChapter,
    onRunFullAudit,
    onCheckContinuity,
    onCheckCharacterConsistency,
    onCheckPacing,
    onAutoRepair,
    onStrengthenConflict,
    onEnhanceEmotion,
    onUnifyStyle,
    onAddDialogue,
    onAddDescription,
    isGeneratingTaskSheet,
    isGeneratingSceneCards,
    isSummarizingChapter,
    reviewActionKind,
    repairActionKind,
    generationActionKind,
    isReviewingChapter,
    isRepairingChapter,
    reviewResult,
    replanRecommendation,
    lastReplanResult,
    chapterPlan,
    latestStateSnapshot,
    chapterStateSnapshot,
    chapterTimeline,
    isLoadingChapterTimeline,
    chapterResourceContext,
    isLoadingChapterResourceContext,
    resourceWorkflowMode = "manual",
    pendingCharacterResourceProposals = [],
    onExtractChapterResources,
    isExtractingChapterResources = false,
    onConfirmCharacterResourceProposal,
    onRejectCharacterResourceProposal,
    confirmingCharacterResourceProposalId = "",
    rejectingCharacterResourceProposalId = "",
    chapterAuditReports,
    backgroundSyncActivities,
    isGeneratingChapterPlan,
    isReplanningChapter,
    isRunningFullAudit,
    chapterQualityReport,
    chapterRuntimePackage,
    repairStreamContent,
    isRepairStreaming,
    repairStreamingChapterId,
    repairStreamingChapterLabel,
    repairRunStatus,
    onAbortRepair,
    streamContent,
    isStreaming,
    streamingChapterId,
    streamingChapterLabel,
    chapterRunStatus,
    onAbortStream,
    directorTakeoverEntry,
  } = props;

  const [assetTab, setAssetTab] = useState<AssetTabKey>("content");
  const [queueFilter, setQueueFilter] = useState<QueueFilterKey>("all");
  const [assistSheet, setAssistSheet] = useState<AssistSheet>(null);
  const [rightRailTab, setRightRailTab] = useState<"insights" | "reference" | "agent">("agent");

  const openAuditIssues = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => ({
      ...issue,
      auditType: report.auditType,
    }))),
    [chapterAuditReports],
  );
  const activeReplanRecommendation = useMemo(
    () => replanRecommendation ?? buildReplanRecommendationFromAuditReports(chapterAuditReports),
    [chapterAuditReports, replanRecommendation],
  );
  const filteredChapters = useMemo(
    () => chapters.filter((chapter) => chapterMatchesQueueFilter(chapter, queueFilter)),
    [chapters, queueFilter],
  );
  const queueFilters = useMemo(
    () => ([
      { key: "all", label: "全部" },
      { key: "setup", label: "待准备" },
      { key: "draft", label: "待写作" },
      { key: "review", label: "待修整" },
      { key: "completed", label: "已完成" },
    ] as const).map((item) => ({
      ...item,
      count: chapters.filter((chapter) => chapterMatchesQueueFilter(chapter, item.key)).length,
    })),
    [chapters],
  );

  const displayedStatus = selectedChapter
    ? resolveDisplayedChapterStatus(selectedChapter)
    : undefined;
  const isSelectedChapterStreaming = Boolean(
    selectedChapter && isStreaming && streamingChapterId === selectedChapter.id,
  );
  const isSelectedChapterRepairing = Boolean(
    selectedChapter && isRepairingChapter && repairStreamingChapterId === selectedChapter.id,
  );
  const primaryAction = resolvePrimaryAction({
    novelId,
    selectedChapter: selectedChapter
      ? {
        ...selectedChapter,
        chapterStatus: displayedStatus ?? selectedChapter.chapterStatus,
      }
      : undefined,
    hasCharacters,
    isGeneratingChapterPlan,
    isRunningFullAudit,
    isSelectedChapterStreaming,
    isSelectedChapterRepairing,
    onGenerateChapterPlan,
    onRunFullAudit,
    onAutoRepair,
    onGenerateSelectedChapter,
  });

  const selectedLabel = selectedChapter
    ? `第${selectedChapter.order}章 ${selectedChapter.title || "未命名"}`
    : "尚未选择章节";

  const openAssist = (sheet: Exclude<AssistSheet, null>, rail?: "insights" | "reference" | "agent") => {
    if (rail) {
      setRightRailTab(rail);
      if (rail === "reference" && assetTab === "content") {
        setAssetTab("taskSheet");
      }
    }
    setAssistSheet(sheet);
  };

  return (
    <div className="mobile-chapter-execution space-y-3 pb-36">
      <DirectorTakeoverEntryPanel
        title="从章节执行接管"
        description="AI 会先判断当前是否有活动批次、检查点或可执行章节范围，再决定恢复当前批次还是按你的选择新开批次。"
        entry={directorTakeoverEntry}
      />

      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">章节执行</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              先看正文，再点底部主按钮继续写。章节列表和 AI 辅助放在下方入口里。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-10 shrink-0"
            onClick={onCreateChapter}
            disabled={isCreatingChapter}
          >
            {isCreatingChapter ? "创建中..." : "新建"}
          </Button>
        </div>
      </div>

      <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

      {chapterOperationMessage ? (
        <div className="rounded-xl bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {chapterOperationMessage}
        </div>
      ) : null}

      {!hasCharacters ? (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span>请先添加至少 1 个角色，再生成章节内容。</span>
          <Button size="sm" variant="outline" className="h-10 w-full" onClick={onGoToCharacterTab}>
            去角色管理
          </Button>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left"
          onClick={() => openAssist("queue")}
        >
          <div className="text-[11px] text-muted-foreground">当前章节</div>
          <div className="mt-0.5 truncate text-sm font-medium text-foreground">{selectedLabel}</div>
        </button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label="打开章节列表"
          onClick={() => openAssist("queue")}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-w-0 overflow-x-hidden">
        <ChapterExecutionResultPanel
          selectedChapter={selectedChapter}
          onOpenReferencePanel={(tab) => {
            setAssetTab(tab);
            openAssist("reference", "reference");
          }}
          chapterPlan={chapterPlan}
          streamContent={streamContent}
          isStreaming={isStreaming}
          streamingChapterId={streamingChapterId}
          streamingChapterLabel={streamingChapterLabel}
          chapterRunStatus={chapterRunStatus}
          onAbortStream={onAbortStream}
          onRunFullAudit={onRunFullAudit}
          isRunningFullAudit={isRunningFullAudit}
          onAutoRepair={onAutoRepair}
          isRepairStreaming={isRepairStreaming}
          repairStreamingChapterId={repairStreamingChapterId}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-11"
          onClick={() => openAssist("agent", "agent")}
        >
          <Sparkles className="h-4 w-4" />
          AI 执行台
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-11"
          onClick={() => openAssist("insights", "insights")}
        >
          <Wrench className="h-4 w-4" />
          动态与资料
        </Button>
      </div>

      <div
        className="fixed left-3 right-3 z-40 space-y-2 rounded-xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p className="px-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {primaryAction.reason}
        </p>
        <PrimaryActionButton action={primaryAction} className="h-11 min-h-11 w-full text-base" />
      </div>

      <Sheet open={assistSheet === "queue"} onOpenChange={(open) => !open && setAssistSheet(null)}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 p-0">
          <SheetHeader>
            <SheetTitle>章节列表</SheetTitle>
            <SheetDescription>选择要推进的章节，再回到正文继续写。</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-3 pb-4">
            <ChapterExecutionQueueCard
              chapters={filteredChapters}
              selectedChapterId={selectedChapterId}
              queueFilter={queueFilter}
              queueFilters={queueFilters}
              streamingChapterId={streamingChapterId}
              streamingPhase={streamingChapterId ? (chapterRunStatus?.phase ?? "streaming") : null}
              repairStreamingChapterId={repairStreamingChapterId}
              onQueueFilterChange={setQueueFilter}
              onSelectChapter={(chapterId) => {
                onSelectChapter(chapterId);
                setAssistSheet(null);
              }}
              onRemoveChapter={onRemoveChapter}
              removingChapterId={removingChapterId}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet
        open={assistSheet === "agent" || assistSheet === "insights" || assistSheet === "reference"}
        onOpenChange={(open) => !open && setAssistSheet(null)}
      >
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 p-0">
          <SheetHeader>
            <SheetTitle>章节辅助</SheetTitle>
            <SheetDescription>AI 动作、动态和资料诊断都在这里，不影响正文阅读。</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-3 pb-4">
            <Tabs
              value={rightRailTab}
              onValueChange={(value) => {
                const nextTab = value as "insights" | "reference" | "agent";
                if (nextTab === "reference" && assetTab === "content") {
                  setAssetTab("taskSheet");
                }
                setRightRailTab(nextTab);
                setAssistSheet(nextTab === "agent" ? "agent" : nextTab);
              }}
              className="flex min-h-0 flex-col"
            >
              <TabsList className="grid h-auto w-full shrink-0 grid-cols-3 rounded-xl bg-muted/50 p-1.5">
                <TabsTrigger value="agent" className="rounded-lg px-2 py-2 text-xs sm:text-sm">AI 执行台</TabsTrigger>
                <TabsTrigger value="insights" className="rounded-lg px-2 py-2 text-xs sm:text-sm">动态栏</TabsTrigger>
                <TabsTrigger value="reference" className="rounded-lg px-2 py-2 text-xs sm:text-sm">资料诊断</TabsTrigger>
              </TabsList>
              <TabsContent value="agent" className="mt-3">
                <ChapterExecutionActionPanel
                  novelId={novelId}
                  selectedChapter={selectedChapter}
                  hasCharacters={hasCharacters}
                  strategy={strategy}
                  onStrategyChange={onStrategyChange}
                  onApplyStrategy={onApplyStrategy}
                  isApplyingStrategy={isApplyingStrategy}
                  onGenerateSelectedChapter={onGenerateSelectedChapter}
                  onRewriteChapter={onRewriteChapter}
                  onExpandChapter={onExpandChapter}
                  onCompressChapter={onCompressChapter}
                  onSummarizeChapter={onSummarizeChapter}
                  onGenerateTaskSheet={onGenerateTaskSheet}
                  onGenerateSceneCards={onGenerateSceneCards}
                  onGenerateChapterPlan={onGenerateChapterPlan}
                  onReplanChapter={onReplanChapter}
                  onRunFullAudit={onRunFullAudit}
                  onCheckContinuity={onCheckContinuity}
                  onCheckCharacterConsistency={onCheckCharacterConsistency}
                  onCheckPacing={onCheckPacing}
                  onAutoRepair={onAutoRepair}
                  onStrengthenConflict={onStrengthenConflict}
                  onEnhanceEmotion={onEnhanceEmotion}
                  onUnifyStyle={onUnifyStyle}
                  onAddDialogue={onAddDialogue}
                  onAddDescription={onAddDescription}
                  isGeneratingTaskSheet={isGeneratingTaskSheet}
                  isGeneratingSceneCards={isGeneratingSceneCards}
                  isSummarizingChapter={isSummarizingChapter}
                  reviewActionKind={reviewActionKind}
                  repairActionKind={repairActionKind}
                  generationActionKind={generationActionKind}
                  isReviewingChapter={isReviewingChapter}
                  isRepairingChapter={isRepairingChapter}
                  isGeneratingChapterPlan={isGeneratingChapterPlan}
                  isReplanningChapter={isReplanningChapter}
                  isRunningFullAudit={isRunningFullAudit}
                  isStreaming={isStreaming}
                  streamingChapterId={streamingChapterId}
                  chapterAuditReports={chapterAuditReports}
                  chapterRuntimePackage={chapterRuntimePackage}
                  latestStateSnapshot={latestStateSnapshot}
                  chapterStateSnapshot={chapterStateSnapshot}
                  backgroundSyncActivities={backgroundSyncActivities}
                  chapterRunStatus={chapterRunStatus}
                  repairRunStatus={repairRunStatus}
                  repairStreamingChapterId={repairStreamingChapterId}
                />
              </TabsContent>
              <TabsContent value="insights" className="mt-3">
                <ChapterExecutionInsightsSidebar
                  selectedChapter={selectedChapter}
                  chapterTimeline={chapterTimeline}
                  isLoadingChapterTimeline={isLoadingChapterTimeline}
                  latestStateSnapshot={latestStateSnapshot}
                  chapterStateSnapshot={chapterStateSnapshot}
                  chapterRuntimePackage={chapterRuntimePackage}
                  chapterPlan={chapterPlan}
                  chapterQualityReport={chapterQualityReport}
                  reviewResult={reviewResult}
                  openAuditIssues={openAuditIssues}
                  chapterResourceContext={chapterResourceContext}
                  isLoadingChapterResourceContext={isLoadingChapterResourceContext}
                  resourceWorkflowMode={resourceWorkflowMode}
                  pendingCharacterResourceProposals={pendingCharacterResourceProposals}
                  onExtractChapterResources={onExtractChapterResources}
                  isExtractingChapterResources={isExtractingChapterResources}
                  onConfirmCharacterResourceProposal={onConfirmCharacterResourceProposal}
                  onRejectCharacterResourceProposal={onRejectCharacterResourceProposal}
                  confirmingCharacterResourceProposalId={confirmingCharacterResourceProposalId}
                  rejectingCharacterResourceProposalId={rejectingCharacterResourceProposalId}
                />
              </TabsContent>
              <TabsContent value="reference" className="mt-3">
                <ChapterExecutionReferencePanel
                  selectedChapter={selectedChapter}
                  assetTab={assetTab}
                  onAssetTabChange={setAssetTab}
                  chapterPlan={chapterPlan}
                  latestStateSnapshot={latestStateSnapshot}
                  chapterAuditReports={chapterAuditReports}
                  replanRecommendation={activeReplanRecommendation}
                  onReplanChapter={onReplanChapter}
                  isReplanningChapter={isReplanningChapter}
                  lastReplanResult={lastReplanResult}
                  chapterQualityReport={chapterQualityReport}
                  chapterRuntimePackage={chapterRuntimePackage}
                  reviewResult={reviewResult}
                  openAuditIssues={openAuditIssues}
                  repairStreamContent={repairStreamContent}
                  isRepairStreaming={isRepairStreaming}
                  repairStreamingChapterId={repairStreamingChapterId}
                  repairStreamingChapterLabel={repairStreamingChapterLabel}
                  repairRunStatus={repairRunStatus}
                  onAbortRepair={onAbortRepair}
                />
              </TabsContent>
            </Tabs>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
