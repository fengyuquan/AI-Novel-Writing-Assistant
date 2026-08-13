import type {
  Chapter,
  ChapterEditorAiWritingDetectResponse,
  ChapterEditorCandidate,
  ChapterEditorDiagnosticCard,
  ChapterEditorDiffChunk,
  ChapterEditorOperation,
  ChapterEditorRevisionScope,
  ChapterEditorWorkspaceResponse,
} from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import FocusModeToolbar from "../aids/FocusModeToolbar";
import ChapterEditorDirectorPanel from "../ChapterEditorDirectorPanel";
import ChapterEditorSidebar from "../ChapterEditorSidebar";
import type { ChapterEditorAuditResult } from "../ChapterEditorAuditPanel";
import type { ChapterEditorMobilePane } from "../chapterEditorPageHelpers";
import type { ChapterEditorPersistStatus } from "../chapterEditorUtils";
import type {
  ChapterEditorNeighborChapter,
  ChapterEditorSelectionRange,
  ChapterEditorSessionState,
  SelectionToolbarPosition,
} from "../chapterEditorTypes";
import ChapterEditorWriteColumn from "./ChapterEditorWriteColumn";

type ChapterEditorPreview =
  | {
    mode: "loading";
    from: number;
    to: number;
    originalText: string;
  }
  | {
    mode: "inline";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    originalText: string;
    candidateText: string;
  }
  | {
    mode: "block";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    originalText: string;
    candidateText: string;
  };

export interface ChapterEditorShellLayoutProps {
  novelId: string;
  chapter: Chapter;
  previousChapter?: ChapterEditorNeighborChapter | null;
  nextChapter?: ChapterEditorNeighborChapter | null;
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  focusMode: boolean;
  mobilePane: ChapterEditorMobilePane;
  aiPanelOpen: boolean;
  aiDetectOpen: boolean;
  desktopGridClassName: string;
  showGuidePane: boolean;
  showWritePane: boolean;
  showAiPane: boolean;
  wordCount: number;
  wordCountLabel: string;
  wordCountDetail: string;
  saveStatusLabel: string;
  syncStatusLabel: string;
  isDirty: boolean;
  needsSync: boolean;
  openIssueCount: number;
  isSaving: boolean;
  isSyncing: boolean;
  contentDraft: string;
  selection: ChapterEditorSelectionRange | null;
  selectionToolbarPosition: SelectionToolbarPosition | null;
  selectedDiagnosticId: string | null;
  selectedDiagnosticCard: ChapterEditorDiagnosticCard | null;
  canRunAudit: boolean;
  isRunningFullAudit: boolean;
  isRunningLightAudit: boolean;
  isResolvingIssue: boolean;
  auditResult: ChapterEditorAuditResult | null;
  auditErrorMessage?: string | null;
  contentSaveStatus: ChapterEditorPersistStatus;
  onAutoSaveContent: (content: string) => void;
  aiWritingDetectResult: ChapterEditorAiWritingDetectResponse | null;
  aiWritingDetectErrorMessage?: string | null;
  isRunningAiWritingDetect: boolean;
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  revisionScope: ChapterEditorRevisionScope;
  revisionInstruction: string;
  canRunSelectionRevision: boolean;
  currentTargetDescription: string;
  isGenerating: boolean;
  isApplying: boolean;
  preview: ChapterEditorPreview | null;
  focusRange: Pick<ChapterEditorSelectionRange, "from" | "to"> | null;
  onToggleFocusMode: () => void;
  onSetMobilePane: (pane: ChapterEditorMobilePane) => void;
  onToggleAiPanel: () => void;
  onCollapseAiPanel: () => void;
  onToggleAiDetect: () => void;
  onSave: () => void;
  onSyncSave: () => void;
  onRunAiWritingDetect: () => void;
  onBack?: () => void;
  onOpenVersionHistory?: () => void;
  onGoPreviousChapter?: () => void;
  onGoNextChapter?: () => void;
  onRunFullAudit: () => void;
  onRunLightAudit: () => void;
  onResolveAuditIssue: (issueId: string) => void;
  onLocateAuditIssue: (evidence: string, description?: string) => void;
  onFixAuditIssue: (fixSuggestion: string, evidence: string, description?: string) => void;
  onStuckDirection: (directionId: string) => void;
  onLocateRange: (range: ChapterEditorSelectionRange) => void;
  onRefreshAfterRestore: () => Promise<void>;
  onFocusDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onRunDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onContentChange: (next: string) => void;
  onSelectionChange: (
    nextSelection: ChapterEditorSelectionRange | null,
    position: SelectionToolbarPosition | null,
  ) => void;
  onRunSelectionOperation: (operation: ChapterEditorOperation, customInstruction?: string) => void;
  onInstructionChange: (next: string) => void;
  onScopeChange: (scope: ChapterEditorRevisionScope) => void;
  onRunRecommended: () => void;
  onRunSelectedDiagnostic: () => void;
  onRunFreeform: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onChangeViewMode: (mode: "inline" | "block") => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export default function ChapterEditorShellLayout(props: ChapterEditorShellLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <FocusModeToolbar
        enabled={props.focusMode}
        wordCount={props.wordCount}
        saveStatusLabel={props.saveStatusLabel}
        syncStatusLabel={props.syncStatusLabel}
        isDirty={props.isDirty}
        needsSync={props.needsSync}
        isSaving={props.isSaving}
        isSyncing={props.isSyncing}
        onToggle={props.onToggleFocusMode}
        onSave={props.onSave}
        onSyncSave={props.onSyncSave}
      />

      {!props.focusMode ? (
        <div className="flex shrink-0 gap-2 xl:hidden">
          {([
            ["guide", "引导与审校"],
            ["write", "写正文"],
            ["ai", "AI 修正"],
          ] as const).map(([pane, label]) => (
            <Button
              key={pane}
              size="sm"
              variant={props.mobilePane === pane ? "default" : "outline"}
              className="flex-1"
              onClick={() => props.onSetMobilePane(pane)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className={`grid min-h-0 flex-1 grid-rows-1 gap-4 overflow-hidden ${props.desktopGridClassName}`}>
        <div
          className={`min-h-0 overflow-hidden ${
            props.showGuidePane ? "flex h-full min-h-0 flex-col" : "hidden"
          } ${props.focusMode ? "xl:hidden" : "xl:flex xl:h-full xl:min-h-0 xl:flex-col"}`}
        >
          <ChapterEditorSidebar
            novelId={props.novelId}
            chapter={props.chapter}
            previousChapter={props.previousChapter}
            nextChapter={props.nextChapter}
            workspace={props.workspace}
            workspaceStatus={props.workspaceStatus}
            wordCount={props.wordCount}
            contentDraft={props.contentDraft}
            onContentChange={props.onContentChange}
            isDirty={props.isDirty}
            contentSaveStatus={props.contentSaveStatus}
            isSavingContent={props.isSaving}
            onAutoSaveContent={props.onAutoSaveContent}
            hasSelection={Boolean(props.selection?.text.trim())}
            isGeneratingStuck={props.isGenerating}
            selectedDiagnosticId={props.selectedDiagnosticId}
            canRunAudit={props.canRunAudit}
            isRunningFullAudit={props.isRunningFullAudit}
            isRunningLightAudit={props.isRunningLightAudit}
            isResolvingIssue={props.isResolvingIssue}
            auditResult={props.auditResult}
            auditErrorMessage={props.auditErrorMessage}
            onBack={props.onBack}
            onOpenVersionHistory={props.onOpenVersionHistory}
            onGoPreviousChapter={props.onGoPreviousChapter}
            onGoNextChapter={props.onGoNextChapter}
            onRunFullAudit={props.onRunFullAudit}
            onRunLightAudit={props.onRunLightAudit}
            onResolveAuditIssue={props.onResolveAuditIssue}
            onLocateAuditIssue={props.onLocateAuditIssue}
            onFixAuditIssue={props.onFixAuditIssue}
            onStuckDirection={props.onStuckDirection}
            onLocateRange={props.onLocateRange}
            onRefreshAfterRestore={props.onRefreshAfterRestore}
            onFocusDiagnostic={props.onFocusDiagnostic}
            onRunDiagnostic={props.onRunDiagnostic}
          />
        </div>

        <div
          className={`relative min-h-0 overflow-hidden ${
            props.showWritePane ? "flex h-full min-h-0 flex-col" : "hidden"
          } xl:flex xl:h-full xl:min-h-0 xl:flex-col`}
        >
          <ChapterEditorWriteColumn
            showStatusBar={!props.focusMode}
            wordCountLabel={props.wordCountLabel}
            wordCountDetail={props.wordCountDetail}
            saveStatusLabel={props.saveStatusLabel}
            syncStatusLabel={props.syncStatusLabel}
            isDirty={props.isDirty}
            needsSync={props.needsSync}
            openIssueCount={props.openIssueCount}
            isSaving={props.isSaving}
            isSyncing={props.isSyncing}
            onSave={props.onSave}
            onSyncSave={props.onSyncSave}
            aiPanelOpen={props.aiPanelOpen}
            onToggleAiPanel={props.onToggleAiPanel}
            showAiPanelToggle={!props.focusMode}
            aiDetectOpen={props.aiDetectOpen}
            onToggleAiDetect={props.onToggleAiDetect}
            aiWritingDetect={{
              isDirty: props.isDirty,
              canRun: props.canRunAudit,
              isRunning: props.isRunningAiWritingDetect,
              result: props.aiWritingDetectResult,
              errorMessage: props.aiWritingDetectErrorMessage,
              onRun: props.onRunAiWritingDetect,
              onLocateIssue: props.onLocateAuditIssue,
              onFixIssue: props.onFixAuditIssue,
            }}
            value={props.contentDraft}
            readOnly={props.session.status !== "idle"}
            selection={props.selection}
            onChange={props.onContentChange}
            onSelectionChange={props.onSelectionChange}
            preview={props.preview}
            focusRange={props.focusRange}
            selectionToolbarVisible={Boolean(props.selection && props.session.status === "idle")}
            selectionToolbarPosition={props.selectionToolbarPosition}
            selectionToolbarDisabled={props.isGenerating}
            onRunSelectionOperation={props.onRunSelectionOperation}
          />
        </div>

        <div
          className={`min-h-0 overflow-hidden ${
            props.showAiPane ? "flex h-full min-h-0 flex-col" : "hidden"
          } ${
            props.focusMode || !props.aiPanelOpen
              ? "xl:hidden"
              : "xl:flex xl:h-full xl:min-h-0 xl:flex-col"
          }`}
        >
          <ChapterEditorDirectorPanel
            workspace={props.workspace}
            workspaceStatus={props.workspaceStatus}
            selectedDiagnosticCard={props.selectedDiagnosticCard}
            session={props.session}
            activeCandidate={props.activeCandidate}
            revisionScope={props.revisionScope}
            revisionInstruction={props.revisionInstruction}
            canRunSelectionRevision={props.canRunSelectionRevision}
            currentTargetDescription={props.currentTargetDescription}
            isGenerating={props.isGenerating}
            isApplying={props.isApplying}
            onInstructionChange={props.onInstructionChange}
            onScopeChange={props.onScopeChange}
            onRunRecommended={props.onRunRecommended}
            onRunSelectedDiagnostic={props.onRunSelectedDiagnostic}
            onRunFreeform={props.onRunFreeform}
            onSelectCandidate={props.onSelectCandidate}
            onChangeViewMode={props.onChangeViewMode}
            onAccept={props.onAccept}
            onReject={props.onReject}
            onRegenerate={props.onRegenerate}
            onCollapse={props.onCollapseAiPanel}
          />
        </div>
      </div>
    </div>
  );
}
