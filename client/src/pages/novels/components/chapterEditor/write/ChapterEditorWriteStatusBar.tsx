import type { ChapterEditorAiWritingDetectResponse } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import ChapterEditorAiWritingDetectPanel from "../ChapterEditorAiWritingDetectPanel";

function StatusChip(props: { label: string; tone?: "default" | "warn" | "ok" | "danger" }) {
  const toneClassName = props.tone === "warn"
    ? "bg-amber-100 text-amber-900"
    : props.tone === "ok"
      ? "bg-emerald-100 text-emerald-900"
      : props.tone === "danger"
        ? "bg-rose-100 text-rose-900"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-1 text-xs ${toneClassName}`}>
      {props.label}
    </span>
  );
}

interface ChapterEditorWriteStatusBarProps {
  wordCountLabel: string;
  wordCountDetail: string;
  saveStatusLabel: string;
  syncStatusLabel: string;
  isDirty: boolean;
  needsSync: boolean;
  isDirtyTone?: boolean;
  openIssueCount: number;
  isSaving: boolean;
  isSyncing: boolean;
  onSave: () => void;
  onSyncSave: () => void;
  aiDetectOpen: boolean;
  onToggleAiDetect: () => void;
  showAiPanelToggle?: boolean;
  aiPanelOpen?: boolean;
  onToggleAiPanel?: () => void;
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
}

export default function ChapterEditorWriteStatusBar(props: ChapterEditorWriteStatusBarProps) {
  const {
    wordCountLabel,
    wordCountDetail,
    saveStatusLabel,
    syncStatusLabel,
    isDirty,
    needsSync,
    isSaving,
    isSyncing,
    onSave,
    onSyncSave,
    openIssueCount,
    aiDetectOpen,
    onToggleAiDetect,
    showAiPanelToggle,
    aiPanelOpen,
    onToggleAiPanel,
    aiWritingDetect,
  } = props;

  return (
    <div className="shrink-0 space-y-2 border-b border-border/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip label={wordCountLabel} />
        <StatusChip
          label={saveStatusLabel}
          tone={saveStatusLabel === "保存失败" ? "danger" : isDirty ? "warn" : "ok"}
        />
        <StatusChip
          label={syncStatusLabel}
          tone={syncStatusLabel === "同步失败" ? "danger" : needsSync ? "warn" : "ok"}
        />
        <StatusChip label={`问题 ${openIssueCount}`} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8" onClick={onSave} disabled={!isDirty || isSaving || isSyncing}>
            {isSaving ? "保存中..." : "保存"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={onSyncSave}
            disabled={(!isDirty && !needsSync) || isSaving || isSyncing}
          >
            {isSyncing ? "同步中..." : "同步保存"}
          </Button>
          <Button
            size="sm"
            variant={aiDetectOpen ? "default" : "outline"}
            className="h-8"
            onClick={onToggleAiDetect}
          >
            AI 写法检测
            {aiWritingDetect.result?.issues.length
              ? ` · ${aiWritingDetect.result.issues.length}`
              : ""}
          </Button>
          {showAiPanelToggle && onToggleAiPanel ? (
            <Button
              size="sm"
              variant={aiPanelOpen ? "default" : "outline"}
              className="hidden h-8 xl:inline-flex"
              onClick={onToggleAiPanel}
            >
              {aiPanelOpen ? "收起 AI 修正" : "打开 AI 修正"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="text-[11px] leading-5 text-muted-foreground">
        {wordCountDetail} · Ctrl/⌘+S 快速保存；同步保存才会更新摘要与检索资料。
      </div>
      {aiDetectOpen ? (
        <ChapterEditorAiWritingDetectPanel
          isDirty={aiWritingDetect.isDirty}
          canRun={aiWritingDetect.canRun}
          isRunning={aiWritingDetect.isRunning}
          result={aiWritingDetect.result}
          errorMessage={aiWritingDetect.errorMessage}
          onRun={aiWritingDetect.onRun}
          onLocateIssue={aiWritingDetect.onLocateIssue}
          onFixIssue={aiWritingDetect.onFixIssue}
        />
      ) : null}
    </div>
  );
}
