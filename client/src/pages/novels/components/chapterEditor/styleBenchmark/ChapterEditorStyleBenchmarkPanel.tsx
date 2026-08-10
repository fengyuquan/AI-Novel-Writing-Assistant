import { useEffect, useRef, useState } from "react";
import { useLLMStore } from "@/store/llmStore";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ChapterEditorStyleBenchmarkCompareDialog from "./ChapterEditorStyleBenchmarkCompareDialog";
import { benchmarkVersionKey, formatBenchmarkModelLabel } from "./styleBenchmarkStorage";
import { useChapterEditorStyleBenchmarkActions } from "./useChapterEditorStyleBenchmarkActions";

interface ChapterEditorStyleBenchmarkPanelProps {
  novelId: string;
  chapterId: string;
  contentDraft: string;
  isDirty: boolean;
  onContentChange: (next: string) => void;
  onLocateEvidence: (evidence: string, description?: string) => void;
}

export default function ChapterEditorStyleBenchmarkPanel(props: ChapterEditorStyleBenchmarkPanelProps) {
  const {
    novelId,
    chapterId,
    contentDraft,
    isDirty,
    onContentChange,
  } = props;
  const llm = useLLMStore();
  const {
    sourceOptions,
    sourcesLoading,
    sourcesError,
    selectedSourceKey,
    setSelectedSourceKey,
    benchmarks,
    visibleBenchmarks,
    focusedBenchmark,
    focusedCompareResult,
    compareBySessionId,
    activeSessionIds,
    focusedSessionId,
    layoutColumns,
    setLayoutColumns,
    focusBenchmark,
    toggleBenchmarkVisible,
    removeBenchmark,
    updateBenchmarkContent,
    restoredFromCache,
    latestGeneratedSessionId,
    errorMessage,
    isRewriting,
    isComparing,
    runRewrite,
    runCompare,
    clearCachedResults,
  } = useChapterEditorStyleBenchmarkActions({
    novelId,
    chapterId,
    contentDraft,
    llm: {
      provider: llm.provider,
      model: llm.model,
    },
    resetToken: chapterId,
  });

  const [compareOpen, setCompareOpen] = useState(false);
  const lastAutoOpenedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (benchmarks.length === 0) {
      setCompareOpen(false);
      lastAutoOpenedSessionRef.current = null;
      return;
    }
    if (
      latestGeneratedSessionId
      && !restoredFromCache
      && latestGeneratedSessionId !== lastAutoOpenedSessionRef.current
    ) {
      lastAutoOpenedSessionRef.current = latestGeneratedSessionId;
      setCompareOpen(true);
    }
  }, [benchmarks.length, latestGeneratedSessionId, restoredFromCache]);

  const canRunRewrite = Boolean(contentDraft.trim() && selectedSourceKey) && !isRewriting && !isComparing;
  const currentVersionKey = selectedSourceKey
    ? `${selectedSourceKey}::${llm.provider || "unknown"}/${llm.model?.trim() || "default"}`
    : "";
  const existingSameVersion = Boolean(
    currentVersionKey
    && benchmarks.some((item) => benchmarkVersionKey(item) === currentVersionKey),
  );

  return (
    <div className="space-y-3 rounded-2xl border border-sky-200/80 bg-sky-50/40 p-3">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">范本对照</div>
        <div className="text-xs leading-5 text-muted-foreground">
          可选多本范本生成对照稿；写好后打开对照窗，支持全屏、段落对齐调整、多标签切换与最多 4 列并排
          {isDirty ? "（会用当前编辑区正文，含未保存修改）" : ""}
          。范文会保存到本章数据库缓存，下次打开同一章仍在。
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-foreground">学习范本</div>
        <select
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
          value={selectedSourceKey}
          disabled={sourcesLoading || sourceOptions.length === 0 || isRewriting}
          onChange={(event) => setSelectedSourceKey(event.target.value)}
        >
          {sourcesLoading ? <option value="">加载中...</option> : null}
          {!sourcesLoading && sourceOptions.length === 0 ? (
            <option value="">暂无可用范本，请先导入知识库爆款、提取写法，或准备一本范本小说</option>
          ) : null}
          {(["写法档案", "知识库爆款", "小说项目"] as const).map((groupLabel) => {
            const items = sourceOptions.filter((item) => item.groupLabel === groupLabel);
            if (items.length === 0) {
              return null;
            }
            return (
              <optgroup key={groupLabel} label={groupLabel}>
                {items.map((item) => (
                  <option key={item.key} value={item.key} disabled={!item.sampleReady}>
                    {item.title}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                    {!item.sampleReady ? "（暂不可用）" : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      <AiButton
        size="sm"
        className="w-full"
        onClick={runRewrite}
        disabled={!canRunRewrite}
      >
        {isRewriting
          ? "正在按范本手感写对照稿..."
          : existingSameVersion
            ? "重新生成该范文此模型版（覆盖）"
            : benchmarks.length > 0
              ? "再生成一篇范文版本并加入对照"
              : "按范本手感写一版本章"}
      </AiButton>

      {sourcesError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          {sourcesError}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {benchmarks.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">已缓存 {benchmarks.length} 篇范文</Badge>
            {restoredFromCache ? <Badge variant="secondary">已从本章缓存恢复</Badge> : null}
            {focusedCompareResult ? <Badge variant="outline">当前范文已点评</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {benchmarks.map((item) => (
              <Badge
                key={item.sessionId}
                variant={item.sessionId === focusedSessionId ? "default" : "outline"}
                className="max-w-full truncate"
                title={`${item.reference.title} · ${formatBenchmarkModelLabel(item)}`}
              >
                {item.reference.title} · {formatBenchmarkModelLabel(item)}
              </Badge>
            ))}
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => setCompareOpen(true)}
          >
            打开左右对照窗
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setCompareOpen(false);
              clearCachedResults();
            }}
            disabled={isRewriting || isComparing}
          >
            清除本章范文缓存
          </Button>
        </div>
      ) : null}

      {benchmarks.length > 0 ? (
        <ChapterEditorStyleBenchmarkCompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          benchmarks={benchmarks}
          visibleBenchmarks={visibleBenchmarks}
          focusedBenchmark={focusedBenchmark}
          focusedCompareResult={focusedCompareResult}
          compareBySessionId={compareBySessionId}
          activeSessionIds={activeSessionIds}
          focusedSessionId={focusedSessionId}
          layoutColumns={layoutColumns}
          userContent={contentDraft}
          onUserContentChange={onContentChange}
          onBenchmarkContentChange={updateBenchmarkContent}
          isComparing={isComparing}
          isRewriting={isRewriting}
          onRunCompare={runCompare}
          onFocusBenchmark={focusBenchmark}
          onToggleBenchmarkVisible={toggleBenchmarkVisible}
          onRemoveBenchmark={removeBenchmark}
          onLayoutColumnsChange={setLayoutColumns}
        />
      ) : null}
    </div>
  );
}
