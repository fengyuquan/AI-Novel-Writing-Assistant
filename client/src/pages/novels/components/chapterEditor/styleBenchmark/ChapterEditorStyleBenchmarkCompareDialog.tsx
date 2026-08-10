import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import type {
  ChapterEditorStyleBenchmarkCompareResponse,
  ChapterEditorStyleBenchmarkRewriteResponse,
} from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  findParagraphIndexByEvidence,
  resolveAlignedRowCount,
  splitBenchmarkParagraphs,
} from "./styleBenchmarkParagraphs";
import {
  formatBenchmarkModelLabel,
  type StyleBenchmarkLayoutColumns,
} from "./styleBenchmarkStorage";
import {
  CompareDeskCollapseToggle,
  CompareSegmentRail,
} from "./styleBenchmarkCompareChrome";
import { StyleBenchmarkCompareParagraphRow } from "./StyleBenchmarkCompareParagraphRow";
import {
  enterBrowserFullscreen,
  exitBrowserFullscreen,
  isBrowserFullscreenActive,
} from "./browserFullscreen";
import {
  MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS,
  isCompactCompareDesk,
  useStyleBenchmarkCompareDeskMode,
} from "./useStyleBenchmarkCompareDeskMode";

function winnerLabel(winner: "user" | "benchmark" | "tie"): string {
  if (winner === "user") {
    return "你的更好";
  }
  if (winner === "benchmark") {
    return "范本更好";
  }
  return "打平";
}

function shortTabLabel(result: ChapterEditorStyleBenchmarkRewriteResponse): string {
  const title = result.reference.title?.trim() || "未命名范文";
  const shortTitle = title.length > 10 ? `${title.slice(0, 10)}…` : title;
  const model = formatBenchmarkModelLabel(result);
  const shortModel = model.length > 14 ? `${model.slice(0, 14)}…` : model;
  return `${shortTitle} · ${shortModel}`;
}

function shortVersionLabel(result: ChapterEditorStyleBenchmarkRewriteResponse): string {
  const title = result.reference.title?.trim() || "未命名范文";
  return title.length > 16 ? `${title.slice(0, 16)}…` : title;
}

interface ChapterEditorStyleBenchmarkCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  benchmarks: ChapterEditorStyleBenchmarkRewriteResponse[];
  visibleBenchmarks: ChapterEditorStyleBenchmarkRewriteResponse[];
  focusedBenchmark: ChapterEditorStyleBenchmarkRewriteResponse | null;
  focusedCompareResult: ChapterEditorStyleBenchmarkCompareResponse | null;
  compareBySessionId: Record<string, ChapterEditorStyleBenchmarkCompareResponse>;
  activeSessionIds: string[];
  focusedSessionId: string | null;
  layoutColumns: StyleBenchmarkLayoutColumns;
  userContent: string;
  onUserContentChange: (next: string) => void;
  onBenchmarkContentChange: (sessionId: string, nextContent: string) => void;
  isComparing: boolean;
  isRewriting: boolean;
  onRunCompare: (sessionId?: string) => void;
  onFocusBenchmark: (sessionId: string) => void;
  onToggleBenchmarkVisible: (sessionId: string) => void;
  onRemoveBenchmark: (sessionId: string) => void;
  onLayoutColumnsChange: (columns: StyleBenchmarkLayoutColumns) => void;
}

export default function ChapterEditorStyleBenchmarkCompareDialog(
  props: ChapterEditorStyleBenchmarkCompareDialogProps,
) {
  const {
    open,
    onOpenChange,
    benchmarks,
    visibleBenchmarks,
    focusedBenchmark,
    focusedCompareResult,
    activeSessionIds,
    focusedSessionId,
    layoutColumns,
    userContent,
    onUserContentChange,
    onBenchmarkContentChange,
    isComparing,
    isRewriting,
    onRunCompare,
    onFocusBenchmark,
    onToggleBenchmarkVisible,
    onRemoveBenchmark,
    onLayoutColumnsChange,
  } = props;

  const deskMode = useStyleBenchmarkCompareDeskMode();
  const compactChrome = isCompactCompareDesk(deskMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [footerExpanded, setFooterExpanded] = useState(true);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [locateToken, setLocateToken] = useState(0);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const dialogSurfaceRef = useRef<HTMLDivElement | null>(null);
  const mobileColumnsAdjustedRef = useRef(false);

  const displayBenchmarks = useMemo(() => {
    if (deskMode === "desktop") {
      return visibleBenchmarks;
    }
    return visibleBenchmarks.slice(0, MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS);
  }, [deskMode, visibleBenchmarks]);

  const userParagraphs = useMemo(() => splitBenchmarkParagraphs(userContent), [userContent]);
  const visibleParagraphSets = useMemo(
    () => displayBenchmarks.map((item) => ({
      sessionId: item.sessionId,
      title: `${item.reference.title} · ${formatBenchmarkModelLabel(item)}`,
      shortTitle: shortVersionLabel(item),
      paragraphs: splitBenchmarkParagraphs(item.benchmarkContent),
      isFocused: item.sessionId === focusedSessionId,
    })),
    [displayBenchmarks, focusedSessionId],
  );

  const rowCount = useMemo(
    () => resolveAlignedRowCount([
      userParagraphs.length,
      ...visibleParagraphSets.map((item) => item.paragraphs.length),
    ]),
    [userParagraphs.length, visibleParagraphSets],
  );

  const weakRowIndexes = useMemo(() => {
    const next = new Set<number>();
    if (!focusedCompareResult) {
      return next;
    }
    for (const segment of focusedCompareResult.segments) {
      if (segment.winner !== "benchmark") {
        continue;
      }
      const index = findParagraphIndexByEvidence(userParagraphs, segment.userExcerpt);
      if (index >= 0) {
        next.add(index);
      }
    }
    return next;
  }, [focusedCompareResult, userParagraphs]);

  const weakProgressLabel = useMemo(() => {
    if (!focusedCompareResult) {
      return null;
    }
    return `弱段 ${weakRowIndexes.size} / ${Math.max(1, focusedCompareResult.segments.length)}`;
  }, [focusedCompareResult, weakRowIndexes.size]);

  useEffect(() => {
    if (!open) {
      setIsFullscreen(false);
      setSelectedRowIndex(0);
      setHeaderExpanded(true);
      setFooterExpanded(true);
      mobileColumnsAdjustedRef.current = false;
      return;
    }
    if (!compactChrome) {
      return;
    }
    setIsFullscreen(true);
    setHeaderExpanded(benchmarks.length === 0 || isRewriting);
    setFooterExpanded(false);
    if (mobileColumnsAdjustedRef.current) {
      return;
    }
    mobileColumnsAdjustedRef.current = true;
    if (deskMode === "portrait-stack" && layoutColumns < 2) {
      onLayoutColumnsChange(MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS);
      return;
    }
    if (layoutColumns > MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS) {
      onLayoutColumnsChange(MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS);
    }
  }, [open, compactChrome, benchmarks.length, isRewriting, deskMode, layoutColumns, onLayoutColumnsChange]);

  useEffect(() => {
    if (!open || !compactChrome) {
      return;
    }
    if (isComparing || isRewriting || benchmarks.length === 0) {
      setHeaderExpanded(true);
    }
  }, [open, compactChrome, isComparing, isRewriting, benchmarks.length]);

  useEffect(() => {
    const sync = () => setBrowserFullscreen(isBrowserFullscreenActive());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      void exitBrowserFullscreen();
      setBrowserFullscreen(false);
      return;
    }
    if (deskMode !== "short-landscape") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const ok = await enterBrowserFullscreen(dialogSurfaceRef.current ?? document.documentElement);
      if (!cancelled) {
        setBrowserFullscreen(ok || isBrowserFullscreenActive());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, deskMode]);

  useEffect(() => {
    if (selectedRowIndex >= rowCount) {
      setSelectedRowIndex(Math.max(0, rowCount - 1));
    }
  }, [selectedRowIndex, rowCount]);

  useEffect(() => {
    if (locateToken <= 0) {
      return;
    }
    const root = scrollRootRef.current;
    const el = rowRefs.current[selectedRowIndex];
    if (!root || !el || selectedRowIndex < 0) {
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = elRect.top - rootRect.top - root.clientHeight / 4;
    root.scrollTop += offset;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locate-only scroll
  }, [locateToken]);

  const locateUserEvidence = (evidence: string) => {
    const index = findParagraphIndexByEvidence(userParagraphs, evidence);
    if (index < 0) {
      return;
    }
    setSelectedRowIndex(index);
    setLocateToken((current) => current + 1);
  };

  const jumpToNextWeak = () => {
    if (weakRowIndexes.size === 0) {
      return;
    }
    const ordered = [...weakRowIndexes].sort((a, b) => a - b);
    const next = ordered.find((index) => index > selectedRowIndex) ?? ordered[0];
    setSelectedRowIndex(next);
    setLocateToken((current) => current + 1);
  };

  const applyUserParagraphs = (nextContent: string, nextSelectedRow?: number) => {
    onUserContentChange(nextContent);
    if (typeof nextSelectedRow === "number") {
      setSelectedRowIndex(nextSelectedRow);
    }
  };

  const applyBenchmarkParagraphs = (
    sessionId: string,
    nextContent: string,
    nextSelectedRow?: number,
  ) => {
    onBenchmarkContentChange(sessionId, nextContent);
    if (typeof nextSelectedRow === "number") {
      setSelectedRowIndex(nextSelectedRow);
    }
  };

  const columnTemplate = useMemo(() => {
    const rightCount = Math.max(1, visibleParagraphSets.length);
    if (deskMode === "short-landscape") {
      return `minmax(0, 1.05fr) repeat(${rightCount}, minmax(0, 1fr))`;
    }
    return `minmax(220px, 1.1fr) repeat(${rightCount}, minmax(220px, 1fr))`;
  }, [deskMode, visibleParagraphSets.length]);

  const shellFullscreen = isFullscreen || compactChrome;
  const maxColumnsSelect = compactChrome ? MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS : 4;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      void exitBrowserFullscreen();
      setBrowserFullscreen(false);
    }
    onOpenChange(next);
  };

  const requestHideBrowserChrome = async () => {
    const ok = await enterBrowserFullscreen(dialogSurfaceRef.current ?? document.documentElement);
    setBrowserFullscreen(ok || isBrowserFullscreenActive());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogSurfaceRef}
        role="dialog"
        aria-modal="true"
        data-compare-desk={shellFullscreen ? "fullscreen" : undefined}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          shellFullscreen
            ? "!inset-0 !left-0 !top-0 !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 !p-0"
            : "h-[min(92dvh,920px)] w-[calc(100vw-1.5rem)] max-w-[min(96vw,1440px)]",
        )}
      >
        {compactChrome ? (
          <CompareDeskCollapseToggle
            edge="top"
            expanded={headerExpanded}
            onToggle={() => setHeaderExpanded((current) => !current)}
            expandLabel="展开对照顶栏"
            collapseLabel="收起对照顶栏"
          />
        ) : null}

        {(!compactChrome || headerExpanded) ? (
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-24 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <DialogTitle>范本段落对照</DialogTitle>
                <DialogDescription>
                  {deskMode === "portrait-stack"
                    ? "竖屏按段堆叠：先你的正文，再对照已勾选范文。主范文用于点评。"
                    : deskMode === "short-landscape"
                      ? "矮横屏并排对照；段落卡上简化标签，列头显示版本。"
                      : "按段落左右对齐对照：每一行是同一段。左右都可编辑；段落错位时可用「空出本段 / 并入上段」对齐。"}
                </DialogDescription>
                {weakProgressLabel ? (
                  <div className="text-xs text-amber-800">{weakProgressLabel}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-1.5">
                  {deskMode === "portrait-stack" ? "同时对照" : "并排范文"}
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                    value={Math.min(layoutColumns, maxColumnsSelect)}
                    onChange={(event) => {
                      const next = Number(event.target.value) as StyleBenchmarkLayoutColumns;
                      onLayoutColumnsChange(next);
                    }}
                  >
                    {Array.from({ length: maxColumnsSelect }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>
                        {deskMode === "portrait-stack" ? `${value} 篇` : `${value} 列`}
                      </option>
                    ))}
                  </select>
                </label>
                {weakRowIndexes.size > 0 ? (
                  <Button size="sm" variant="outline" className="h-8" onClick={jumpToNextWeak}>
                    下一段弱段
                  </Button>
                ) : null}
                {deskMode === "short-landscape" && !browserFullscreen ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      void requestHideBrowserChrome();
                    }}
                  >
                    隐藏浏览器栏
                  </Button>
                ) : null}
                {!compactChrome ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setIsFullscreen((current) => !current)}
                  >
                    {isFullscreen ? <Minimize2 className="mr-1 h-3.5 w-3.5" /> : <Maximize2 className="mr-1 h-3.5 w-3.5" />}
                    {isFullscreen ? "退出全屏" : "铺满屏幕"}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground">版本库</span>
              {benchmarks.map((item) => {
                const active = activeSessionIds.includes(item.sessionId) || focusedSessionId === item.sessionId;
                const focused = focusedSessionId === item.sessionId;
                return (
                  <div key={item.sessionId} className="flex max-w-full items-center gap-1">
                    <Button
                      size="sm"
                      variant={focused ? "default" : active ? "secondary" : "outline"}
                      className="h-auto min-h-8 max-w-[12rem] whitespace-normal px-2 py-1 text-left text-xs leading-snug"
                    onClick={() => {
                      if (layoutColumns <= 1) {
                        onFocusBenchmark(item.sessionId);
                      } else {
                        onToggleBenchmarkVisible(item.sessionId);
                      }
                    }}
                      title={`${item.reference.title} · ${formatBenchmarkModelLabel(item)}（${focused ? "主范文" : active ? "旁参" : "未对照"}）`}
                    >
                      {focused ? "主 · " : active ? "旁 · " : ""}
                      {shortTabLabel(item)}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 px-0"
                      onClick={() => onRemoveBenchmark(item.sessionId)}
                      title="移除这篇范文缓存"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              {benchmarks.length === 0 ? (
                <span className="text-xs text-muted-foreground">还没有范文，请先在侧栏生成。</span>
              ) : null}
            </div>
            {deskMode !== "desktop" && visibleBenchmarks.length > MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS ? (
              <p className="mt-2 text-xs text-muted-foreground">
                手机对照最多并排 {MOBILE_COMPARE_MAX_BENCHMARK_COLUMNS} 篇范文；可先移出旁参再勾选其他版本。
              </p>
            ) : null}
          </DialogHeader>
        ) : null}

        <div className={cn(
          "flex min-h-0 flex-1 overflow-hidden",
          deskMode === "short-landscape" ? "flex-row gap-2 px-2 py-2" : "flex-col px-3 py-3 sm:px-4",
        )}
        >
          {deskMode === "short-landscape" ? (
            <CompareSegmentRail
              orientation="vertical"
              rowCount={rowCount}
              selectedRowIndex={selectedRowIndex}
              weakRowIndexes={weakRowIndexes}
              onSelect={(rowIndex) => {
                setSelectedRowIndex(rowIndex);
                setLocateToken((current) => current + 1);
              }}
            />
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {deskMode === "portrait-stack" ? (
              <CompareSegmentRail
                orientation="horizontal"
                rowCount={rowCount}
                selectedRowIndex={selectedRowIndex}
                weakRowIndexes={weakRowIndexes}
                onSelect={(rowIndex) => {
                  setSelectedRowIndex(rowIndex);
                  setLocateToken((current) => current + 1);
                }}
              />
            ) : null}

            {deskMode !== "portrait-stack" ? (
              <div
                className="mb-2 grid gap-2 text-xs font-medium text-foreground"
                style={{ gridTemplateColumns: columnTemplate }}
              >
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                  你的段落
                  <span className="ml-2 font-normal text-muted-foreground">可编辑</span>
                </div>
                {visibleParagraphSets.length > 0 ? (
                  visibleParagraphSets.map((item) => (
                    <div
                      key={item.sessionId}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        item.isFocused
                          ? "border-sky-300 bg-sky-50/70"
                          : "border-sky-200/80 bg-sky-50/50",
                      )}
                    >
                      <span className="break-words">
                        {item.isFocused ? "主 · " : "旁 · "}
                        {deskMode === "short-landscape" ? item.shortTitle : item.title}
                      </span>
                      <span className="ml-2 font-normal text-muted-foreground">可编辑</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-muted-foreground">
                    请先选择范文
                  </div>
                )}
              </div>
            ) : null}

            <div
              ref={scrollRootRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
            >
              {Array.from({ length: rowCount }, (_, rowIndex) => (
                <StyleBenchmarkCompareParagraphRow
                  key={`row-${rowIndex}`}
                  rowIndex={rowIndex}
                  active={rowIndex === selectedRowIndex}
                  deskMode={deskMode}
                  columnTemplate={columnTemplate}
                  userParagraphs={userParagraphs}
                  visibleParagraphSets={visibleParagraphSets}
                  onSelectRow={() => setSelectedRowIndex(rowIndex)}
                  onUserContentChange={applyUserParagraphs}
                  onBenchmarkContentChange={applyBenchmarkParagraphs}
                  onFocusBenchmark={onFocusBenchmark}
                  rowRef={(node) => {
                    rowRefs.current[rowIndex] = node;
                  }}
                />
              ))}
            </div>

            {focusedCompareResult && focusedBenchmark && (!compactChrome || footerExpanded) ? (
              <div className="mt-3 max-h-36 shrink-0 space-y-2 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">
                    {focusedBenchmark.reference.title} · {formatBenchmarkModelLabel(focusedBenchmark)}
                  </Badge>
                  <span className="font-medium text-foreground">{winnerLabel(focusedCompareResult.overallWinner)}</span>
                  <Badge variant="outline">{focusedCompareResult.segments.length} 个节拍</Badge>
                </div>
                <div className="text-xs leading-5 text-foreground/90">{focusedCompareResult.summary}</div>
                <div className="space-y-2">
                  {focusedCompareResult.segments.map((segment) => (
                    <div
                      key={`${segment.segmentIndex}-${segment.beatLabel}`}
                      className="rounded-xl border border-border/70 bg-background p-2.5 text-xs leading-5"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={segment.winner === "user" ? "default" : "secondary"}>
                          {winnerLabel(segment.winner)}
                        </Badge>
                        <span className="font-medium text-foreground">{segment.beatLabel}</span>
                      </div>
                      <div className="text-foreground/90">{segment.whyBetter}</div>
                      <div className="mt-1 text-muted-foreground">怎么改弱的一边：{segment.howToImproveWeaker}</div>
                      {segment.userExcerpt ? (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => locateUserEvidence(segment.userExcerpt)}
                          >
                            定位到对应段落
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {compactChrome ? (
          <CompareDeskCollapseToggle
            edge="bottom"
            expanded={footerExpanded}
            onToggle={() => setFooterExpanded((current) => !current)}
            expandLabel="展开对照底栏"
            collapseLabel="收起对照底栏"
          />
        ) : null}

        {(!compactChrome || footerExpanded) ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-6">
            <div className="min-w-0 text-xs leading-5 text-muted-foreground">
              {compactChrome
                ? `当前第 ${selectedRowIndex + 1} 段${focusedBenchmark ? ` · 主范文「${shortVersionLabel(focusedBenchmark)}」` : ""}`
                : "左右按第 N 段对齐；错位时用「空出本段 / 并入上段」。改范文写回本章缓存，改你的正文同步到编辑器草稿。"}
            </div>
            <div className="flex flex-wrap gap-2">
              {weakRowIndexes.size > 0 && compactChrome ? (
                <Button size="sm" variant="outline" onClick={jumpToNextWeak}>
                  下一段弱段
                </Button>
              ) : null}
              <AiButton
                size="sm"
                variant="outline"
                onClick={() => onRunCompare(focusedSessionId ?? undefined)}
                disabled={isComparing || isRewriting || !focusedBenchmark}
              >
                {isComparing
                  ? "正在逐段点评..."
                  : focusedCompareResult
                    ? "重新点评"
                    : "AI 点评"}
              </AiButton>
              <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
