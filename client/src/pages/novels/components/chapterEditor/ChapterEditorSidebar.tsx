import type {
  Chapter,
  ChapterEditorDiagnosticCard,
  ChapterEditorWorkspaceResponse,
} from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import ChapterEditorAuditPanel, {
  type ChapterEditorAuditResult,
} from "./ChapterEditorAuditPanel";
import WritingAidsPanel from "./aids/WritingAidsPanel";
import ChapterEditorStyleBenchmarkPanel from "./styleBenchmark/ChapterEditorStyleBenchmarkPanel";
import ChapterEditorImageStoryPackPanel from "./ChapterEditorImageStoryPackPanel";
import type { ChapterEditorPersistStatus } from "./chapterEditorUtils";
import type { ChapterEditorSelectionRange } from "./chapterEditorTypes";

interface ChapterEditorSidebarProps {
  novelId: string;
  chapter: Chapter;
  previousChapter?: Pick<Chapter, "id" | "order" | "title"> | null;
  nextChapter?: Pick<Chapter, "id" | "order" | "title"> | null;
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  wordCount: number;
  contentDraft: string;
  onContentChange: (next: string) => void;
  isDirty: boolean;
  contentSaveStatus: ChapterEditorPersistStatus;
  isSavingContent: boolean;
  onAutoSaveContent: (content: string) => void;
  hasSelection: boolean;
  isGeneratingStuck: boolean;
  selectedDiagnosticId: string | null;
  canRunAudit: boolean;
  isRunningFullAudit: boolean;
  isRunningLightAudit: boolean;
  isResolvingIssue: boolean;
  auditResult: ChapterEditorAuditResult | null;
  auditErrorMessage?: string | null;
  onBack?: () => void;
  onOpenVersionHistory?: () => void;
  onGoPreviousChapter?: () => void;
  onGoNextChapter?: () => void;
  onRunFullAudit: () => void;
  onRunLightAudit: () => void;
  onResolveAuditIssue?: (issueId: string) => void;
  onLocateAuditIssue?: (evidence: string, description?: string) => void;
  onFixAuditIssue?: (fixSuggestion: string, evidence: string, description?: string) => void;
  onStuckDirection: (directionId: string) => void;
  onLocateRange: (range: ChapterEditorSelectionRange) => void;
  onRefreshAfterRestore: () => Promise<void>;
  onFocusDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onRunDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
}

function LoadingBar(props: { widthClassName?: string }) {
  return (
    <div className={`h-3 animate-pulse rounded-full bg-muted ${props.widthClassName ?? "w-full"}`} />
  );
}

export default function ChapterEditorSidebar(props: ChapterEditorSidebarProps) {
  const {
    novelId,
    chapter,
    previousChapter,
    nextChapter,
    workspace,
    workspaceStatus,
    wordCount,
    contentDraft,
    onContentChange,
    isDirty,
    contentSaveStatus,
    isSavingContent,
    onAutoSaveContent,
    hasSelection,
    isGeneratingStuck,
    selectedDiagnosticId,
    canRunAudit,
    isRunningFullAudit,
    isRunningLightAudit,
    isResolvingIssue,
    auditResult,
    auditErrorMessage,
    onBack,
    onOpenVersionHistory,
    onGoPreviousChapter,
    onGoNextChapter,
    onRunFullAudit,
    onRunLightAudit,
    onResolveAuditIssue,
    onLocateAuditIssue,
    onFixAuditIssue,
    onStuckDirection,
    onLocateRange,
    onRefreshAfterRestore,
    onFocusDiagnostic,
    onRunDiagnostic,
  } = props;

  const recommendedTask = workspace?.recommendedTask ?? null;
  const macroContext = workspace?.macroContext ?? null;
  const isWorkspaceLoading = workspaceStatus === "loading";
  const isWorkspaceError = workspaceStatus === "error";
  const styleSummary = workspace?.chapterMeta.styleSummary?.trim() || "";
  const mustKeep = macroContext?.mustKeepConstraints?.filter(Boolean).slice(0, 4) ?? [];
  const styleHints = [
    styleSummary ? `写法：${styleSummary}` : null,
    macroContext?.characterStateSummary?.trim()
      ? `人物状态：${macroContext.characterStateSummary.trim()}`
      : null,
    ...mustKeep.map((item) => `须保持：${item}`),
  ].filter(Boolean) as string[];

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            {onBack ? (
              <div>
                <Button size="sm" variant="outline" onClick={onBack}>
                  返回章节执行页
                </Button>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!previousChapter || !onGoPreviousChapter}
                onClick={onGoPreviousChapter}
              >
                {previousChapter ? `上一章 ${previousChapter.order}` : "已是首章"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!nextChapter || !onGoNextChapter}
                onClick={onGoNextChapter}
              >
                {nextChapter ? `下一章 ${nextChapter.order}` : "已是末章"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="text-lg font-semibold leading-7 text-foreground">
                第 {chapter.order} 章 · {chapter.title?.trim() || "未命名章节"}
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                先确认本章目标与衔接，再用下方审校检查写法问题。
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <ChapterEditorAuditPanel
                isDirty={isDirty}
                hasSelection={hasSelection}
                isRunningFull={isRunningFullAudit}
                isRunningLight={isRunningLightAudit}
                isResolvingIssue={isResolvingIssue}
                canRun={canRunAudit}
                result={auditResult}
                errorMessage={auditErrorMessage}
                onRunFull={onRunFullAudit}
                onRunLight={onRunLightAudit}
                onResolveIssue={onResolveAuditIssue}
                onLocateIssue={onLocateAuditIssue}
                onFixIssue={onFixAuditIssue}
              />
              {onLocateAuditIssue ? (
                <ChapterEditorStyleBenchmarkPanel
                  novelId={novelId}
                  chapterId={chapter.id}
                  contentDraft={contentDraft}
                  isDirty={isDirty}
                  contentSaveStatus={contentSaveStatus}
                  isSavingContent={isSavingContent}
                  onContentChange={onContentChange}
                  onAutoSaveContent={onAutoSaveContent}
                  onLocateEvidence={onLocateAuditIssue}
                />
              ) : null}
              <ChapterEditorImageStoryPackPanel
                novelId={novelId}
                chapterId={chapter.id}
                chapterOrder={chapter.order}
                chapterTitle={chapter.title}
                contentDraft={contentDraft}
              />
              {onOpenVersionHistory ? (
                <Button size="sm" variant="outline" onClick={onOpenVersionHistory} className="w-full">
                  版本入口
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <WritingAidsPanel
          novelId={novelId}
          chapter={chapter}
          contentDraft={contentDraft}
          wordCount={wordCount}
          isGeneratingStuck={isGeneratingStuck}
          onStuckDirection={onStuckDirection}
          onLocateRange={onLocateRange}
          onRefreshAfterRestore={onRefreshAfterRestore}
        />

        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">前后章衔接</div>
            <span className="text-xs text-muted-foreground">改开头/结尾时对照</span>
          </div>
          {isWorkspaceLoading ? (
            <div className="space-y-3">
              <LoadingBar widthClassName="w-full" />
              <LoadingBar widthClassName="w-5/6" />
            </div>
          ) : macroContext ? (
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <div>
                <div className="mb-1 font-medium text-foreground">承接上一章</div>
                <div>{macroContext.previousChapterBridge}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">铺向下一章</div>
                <div>{macroContext.nextChapterBridge}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm leading-6 text-muted-foreground">
              衔接提示暂不可用，你仍可先改正文。
            </div>
          )}
        </div>

        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">写法与一致性提醒</div>
            <span className="text-xs text-muted-foreground">改语气时留意</span>
          </div>
          {isWorkspaceLoading ? (
            <div className="space-y-3">
              <LoadingBar widthClassName="w-2/3" />
              <LoadingBar widthClassName="w-full" />
            </div>
          ) : styleHints.length > 0 ? (
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {styleHints.map((hint) => (
                <li key={hint} className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-2">
                  {hint}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm leading-6 text-muted-foreground">
              暂无额外写法约束，可按本书既有语气继续写。
            </div>
          )}
        </div>

        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">宏观定位</div>
            <span className="text-xs text-muted-foreground">
              {isWorkspaceLoading ? "AI 分析中" : workspace?.refreshReason ?? "实时生成"}
            </span>
          </div>

          {isWorkspaceLoading ? (
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div>AI 正在分析本章在卷内的位置、节奏建议和章节任务。</div>
              <div className="space-y-3">
                <LoadingBar widthClassName="w-2/3" />
                <LoadingBar widthClassName="w-full" />
                <LoadingBar widthClassName="w-5/6" />
              </div>
            </div>
          ) : macroContext ? (
            <div className="space-y-4 text-sm leading-6">
              <div>
                <div className="mb-1 font-medium text-foreground">本章在本卷中的位置</div>
                <div className="text-muted-foreground">
                  {macroContext.volumeTitle} · {macroContext.volumePositionLabel} · {macroContext.volumePhaseLabel}
                </div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">当前节奏建议</div>
                <div className="text-muted-foreground">{macroContext.paceDirective}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">本章主要任务</div>
                <div className="text-muted-foreground">{macroContext.chapterMission}</div>
              </div>
            </div>
          ) : isWorkspaceError ? (
            <div className="text-sm leading-6 text-muted-foreground">
              宏观定位暂时加载失败，你仍然可以先编辑正文或在右侧直接发起 AI 修正。
            </div>
          ) : (
            <div className="text-sm leading-6 text-muted-foreground">
              正在准备本章的卷内定位和节奏建议。
            </div>
          )}
        </div>

        <div className="min-h-0 shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">待处理问题卡</div>
            <span className="text-xs text-muted-foreground">
              {isWorkspaceLoading
                ? "AI 正在梳理"
                : recommendedTask
                  ? `当前推荐：${recommendedTask.title}`
                  : "等待问题卡"}
            </span>
          </div>

          <div className="space-y-3">
            {isWorkspaceLoading ? (
              <>
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
                  AI 正在按章节问题、卷内位置和节奏目标梳理优先修正项，请稍候。
                </div>
                {[0, 1].map((item) => (
                  <div key={item} className="rounded-2xl border border-border/70 bg-muted/10 p-3">
                    <div className="space-y-3">
                      <LoadingBar widthClassName="w-2/5" />
                      <LoadingBar widthClassName="w-full" />
                    </div>
                  </div>
                ))}
              </>
            ) : workspace && workspace.diagnosticCards.length > 0 ? workspace.diagnosticCards.map((card) => {
              const isSelected = selectedDiagnosticId === card.id;
              const isRecommended = recommendedTask?.title === card.title && recommendedTask.recommendedAction === card.recommendedAction;
              return (
                <div
                  key={card.id}
                  className={`rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-sky-300 bg-sky-50/70"
                      : isRecommended
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-border/70 bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{card.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {card.paragraphLabel || "整章"} · {card.severity}
                      </div>
                    </div>
                    {isRecommended ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                        推荐先修
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-sm leading-6 text-muted-foreground">{card.problemSummary}</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/80">{card.whyItMatters}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => onFocusDiagnostic(card)}
                    >
                      {isSelected ? "取消定位" : "定位到正文"}
                    </Button>
                    <Button size="sm" onClick={() => onRunDiagnostic(card)}>
                      直接用 AI 处理
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
                {isWorkspaceError
                  ? "问题卡暂时加载失败，你可以先在右侧直接输入修改意见，或手动选中片段发起修正。"
                  : workspace
                  ? "AI 暂时还没有整理出明确的问题卡，你可以先在右侧直接输入修改意见，或手动选中片段发起修正。"
                  : "正在加载本章工作区。"}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
