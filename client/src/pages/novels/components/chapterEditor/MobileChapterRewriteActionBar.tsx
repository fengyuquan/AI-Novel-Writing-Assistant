import type { ChapterEditorCandidate, ChapterEditorOperation } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { ChapterEditorSessionState } from "./chapterEditorTypes";
import { CHAPTER_EDITOR_OPERATION_LABELS } from "./chapterEditorUtils";

const QUICK_OPERATIONS: ChapterEditorOperation[] = ["polish", "expand", "compress"];

type MobileChapterRewriteActionBarProps = {
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  hasSelection: boolean;
  isGenerating: boolean;
  isApplying: boolean;
  onRunOperation: (operation: ChapterEditorOperation) => void;
  onOpenAiSheet: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onOpenDetails: () => void;
};

export default function MobileChapterRewriteActionBar(props: MobileChapterRewriteActionBarProps) {
  const {
    session,
    activeCandidate,
    hasSelection,
    isGenerating,
    isApplying,
    onRunOperation,
    onOpenAiSheet,
    onSelectCandidate,
    onAccept,
    onReject,
    onRegenerate,
    onOpenDetails,
  } = props;

  if (session.status === "loading") {
    return (
      <div
        className="fixed left-3 right-3 z-40 space-y-2 rounded-xl border border-border/70 bg-background/95 p-3 shadow-lg"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="text-sm font-medium text-foreground">AI 正在生成候选版本</div>
        <p className="text-xs leading-5 text-muted-foreground">
          先看正文里的对比区域。生成完成后，可在这里直接选用。
        </p>
        <Button type="button" variant="outline" className="h-11 min-h-11 w-full" onClick={onReject}>
          取消本次改写
        </Button>
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div
        className="fixed left-3 right-3 z-40 space-y-2 rounded-xl border border-rose-200 bg-background/95 p-3 shadow-lg"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="text-sm font-medium text-rose-900">改写失败</div>
        <p className="text-xs leading-5 text-rose-800/90">
          {session.errorMessage || "候选生成失败，可以再试一次。"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11 min-h-11" onClick={onReject}>
            关闭
          </Button>
          <Button type="button" className="h-11 min-h-11" onClick={onRegenerate} disabled={isGenerating}>
            再试一次
          </Button>
        </div>
      </div>
    );
  }

  if (session.status === "ready" && activeCandidate) {
    const candidates = session.candidates ?? [];
    return (
      <div
        className="fixed left-3 right-3 z-40 space-y-2 rounded-xl border border-primary/25 bg-background/95 p-3 shadow-lg"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        data-chapter-rewrite-decision="true"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">对比后选用版本</div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {activeCandidate.summary?.trim()
                || session.resolvedIntent?.reasoningSummary
                || "正文里已标出改动，确认后写入本章。"}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={onOpenDetails}>
            说明
          </Button>
        </div>

        {candidates.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {candidates.map((candidate, index) => (
              <Button
                key={candidate.id}
                type="button"
                size="sm"
                variant={candidate.id === session.activeCandidateId ? "default" : "outline"}
                className="h-9 shrink-0"
                onClick={() => onSelectCandidate(candidate.id)}
              >
                {candidate.label || `方案 ${index + 1}`}
              </Button>
            ))}
          </div>
        ) : null}

        <Button
          type="button"
          className="h-11 min-h-11 w-full text-base"
          disabled={isApplying}
          onClick={onAccept}
        >
          {isApplying ? "写入中..." : "用这个版本"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11 min-h-11" disabled={isApplying} onClick={onReject}>
            不要了
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-11"
            disabled={isApplying || isGenerating}
            onClick={onRegenerate}
          >
            再生成
          </Button>
        </div>
      </div>
    );
  }

  if (hasSelection) {
    return (
      <div
        className="fixed left-3 right-3 z-40 space-y-2 rounded-xl border border-border/70 bg-background/95 p-3 shadow-lg"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="text-sm font-medium text-foreground">已选中片段，可直接改写</div>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_OPERATIONS.map((operation) => (
            <Button
              key={operation}
              type="button"
              variant={operation === "polish" ? "default" : "outline"}
              className="h-11 min-h-11 px-1 text-xs"
              disabled={isGenerating}
              onClick={() => onRunOperation(operation)}
            >
              {CHAPTER_EDITOR_OPERATION_LABELS[operation]}
            </Button>
          ))}
        </div>
        <Button type="button" variant="outline" className="h-11 min-h-11 w-full" onClick={onOpenAiSheet}>
          更多改写方式
        </Button>
      </div>
    );
  }

  return null;
}
