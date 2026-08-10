import type {
  ChapterEditorAiWritingDetectResponse,
  ChapterEditorDiffChunk,
  ChapterEditorOperation,
} from "@ai-novel/shared/types/novel";
import ChapterTextEditor from "../ChapterTextEditor";
import SelectionAIFloatingToolbar from "../SelectionAIFloatingToolbar";
import type { ChapterEditorSelectionRange, SelectionToolbarPosition } from "../chapterEditorTypes";
import ChapterEditorWriteStatusBar from "./ChapterEditorWriteStatusBar";

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

interface ChapterEditorWriteColumnProps {
  showStatusBar: boolean;
  wordCountLabel: string;
  wordCountDetail: string;
  saveStatusLabel: string;
  syncStatusLabel: string;
  isDirty: boolean;
  needsSync: boolean;
  openIssueCount: number;
  isSaving: boolean;
  isSyncing: boolean;
  onSave: () => void;
  onSyncSave: () => void;
  aiPanelOpen: boolean;
  onToggleAiPanel: () => void;
  showAiPanelToggle: boolean;
  aiDetectOpen: boolean;
  onToggleAiDetect: () => void;
  aiWritingDetect: {
    isDirty: boolean;
    canRun: boolean;
    isRunning: boolean;
    result: ChapterEditorAiWritingDetectResponse | null;
    errorMessage?: string | null;
    onRun: () => void;
    onLocateIssue: (evidence: string, description?: string) => void;
    onFixIssue: (fixSuggestion: string, evidence: string, description?: string) => void;
  };
  value: string;
  readOnly?: boolean;
  selection?: ChapterEditorSelectionRange | null;
  onChange: (next: string) => void;
  onSelectionChange: (selection: ChapterEditorSelectionRange | null, position: SelectionToolbarPosition | null) => void;
  preview?: ChapterEditorPreview | null;
  focusRange?: Pick<ChapterEditorSelectionRange, "from" | "to"> | null;
  selectionToolbarVisible: boolean;
  selectionToolbarPosition: SelectionToolbarPosition | null;
  selectionToolbarDisabled: boolean;
  onRunSelectionOperation: (operation: ChapterEditorOperation, customInstruction?: string) => void;
}

export default function ChapterEditorWriteColumn(props: ChapterEditorWriteColumnProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
      {props.showStatusBar ? (
        <ChapterEditorWriteStatusBar
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
          aiDetectOpen={props.aiDetectOpen}
          onToggleAiDetect={props.onToggleAiDetect}
          aiWritingDetect={props.aiWritingDetect}
          showAiPanelToggle={props.showAiPanelToggle}
          aiPanelOpen={props.aiPanelOpen}
          onToggleAiPanel={props.onToggleAiPanel}
        />
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ChapterTextEditor
          value={props.value}
          readOnly={props.readOnly}
          selection={props.selection}
          onChange={props.onChange}
          onSelectionChange={props.onSelectionChange}
          preview={props.preview}
          focusRange={props.focusRange}
          embedded
        />
        <SelectionAIFloatingToolbar
          visible={props.selectionToolbarVisible}
          position={props.selectionToolbarPosition}
          disabled={props.selectionToolbarDisabled}
          onRunOperation={props.onRunSelectionOperation}
        />
      </div>
    </div>
  );
}
