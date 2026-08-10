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
  insertBlankParagraphAt,
  mergeParagraphWithPrevious,
  paragraphAt,
  resolveAlignedRowCount,
  splitBenchmarkParagraphs,
  updateParagraphAt,
} from "./styleBenchmarkParagraphs";
import {
  formatBenchmarkModelLabel,
  type StyleBenchmarkLayoutColumns,
} from "./styleBenchmarkStorage";

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

function ParagraphAlignControls(props: {
  rowIndex: number;
  canMergeUp: boolean;
  onInsertBlank: () => void;
  onMergeUp: () => void;
}) {
  const { rowIndex, canMergeUp, onInsertBlank, onMergeUp } = props;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-[11px] text-muted-foreground"
        title="在本段前加空段，让当前内容跳到下一段"
        onClick={(event) => {
          event.stopPropagation();
          onInsertBlank();
        }}
      >
        空出本段
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-[11px] text-muted-foreground"
        title="减少换行，把本段并入上一段"
        disabled={!canMergeUp || rowIndex <= 0}
        onClick={(event) => {
          event.stopPropagation();
          onMergeUp();
        }}
      >
        并入上段
      </Button>
    </div>
  );
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

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [locateToken, setLocateToken] = useState(0);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const userParagraphs = useMemo(() => splitBenchmarkParagraphs(userContent), [userContent]);
  const visibleParagraphSets = useMemo(
    () => visibleBenchmarks.map((item) => ({
      sessionId: item.sessionId,
      title: `${item.reference.title} · ${formatBenchmarkModelLabel(item)}`,
      paragraphs: splitBenchmarkParagraphs(item.benchmarkContent),
    })),
    [visibleBenchmarks],
  );

  const rowCount = useMemo(
    () => resolveAlignedRowCount([
      userParagraphs.length,
      ...visibleParagraphSets.map((item) => item.paragraphs.length),
    ]),
    [userParagraphs.length, visibleParagraphSets],
  );

  useEffect(() => {
    if (!open) {
      setIsFullscreen(false);
      setSelectedRowIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedRowIndex >= rowCount) {
      setSelectedRowIndex(Math.max(0, rowCount - 1));
    }
  }, [selectedRowIndex, rowCount]);

  // 只在显式「定位到对应段落」时滚动；点选段落（尤其是范文侧）不联动跳转。
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
    // selectedRowIndex 与 locateToken 同一次定位里批更新；勿把 selectedRowIndex 放进依赖，避免点选/对齐时误跳。
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
    return `minmax(220px, 1.1fr) repeat(${rightCount}, minmax(220px, 1fr))`;
  }, [visibleParagraphSets.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isFullscreen
            ? "left-0 top-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0"
            : "h-[min(92dvh,920px)] w-[calc(100vw-1.5rem)] max-w-[min(96vw,1440px)]",
        )}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-24 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle>范本段落对照</DialogTitle>
              <DialogDescription>
                按段落左右对齐对照：每一行是同一段。左右都可编辑；段落错位时可用「空出本段 / 并入上段」对齐。点范文只高亮，不跳转定位。
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                并排范文
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                  value={layoutColumns}
                  onChange={(event) => onLayoutColumnsChange(Number(event.target.value) as StyleBenchmarkLayoutColumns)}
                >
                  <option value={1}>1 列</option>
                  <option value={2}>2 列</option>
                  <option value={3}>3 列</option>
                  <option value={4}>4 列</option>
                </select>
              </label>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setIsFullscreen((current) => !current)}
              >
                {isFullscreen ? <Minimize2 className="mr-1 h-3.5 w-3.5" /> : <Maximize2 className="mr-1 h-3.5 w-3.5" />}
                {isFullscreen ? "退出全屏" : "铺满屏幕"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground">已缓存范文</span>
            {benchmarks.map((item) => {
              const active = activeSessionIds.includes(item.sessionId) || focusedSessionId === item.sessionId;
              return (
                <div key={item.sessionId} className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 max-w-[10rem] truncate px-2 text-xs"
                    onClick={() => {
                      if (layoutColumns <= 1) {
                        onFocusBenchmark(item.sessionId);
                      } else {
                        onToggleBenchmarkVisible(item.sessionId);
                      }
                    }}
                    title={`${item.reference.title} · ${formatBenchmarkModelLabel(item)}`}
                  >
                    {shortTabLabel(item)}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
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

          <div className="mb-2 grid gap-2 text-xs font-medium text-foreground" style={{ gridTemplateColumns: columnTemplate }}>
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
              你的段落
              <span className="ml-2 font-normal text-muted-foreground">可编辑</span>
            </div>
            {visibleParagraphSets.length > 0 ? (
              visibleParagraphSets.map((item) => (
                <div
                  key={item.sessionId}
                  className="rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2"
                >
                  <span className="line-clamp-1">{item.title}</span>
                  <span className="ml-2 font-normal text-muted-foreground">可编辑</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-muted-foreground">
                请先选择范文
              </div>
            )}
          </div>

          <div
            ref={scrollRootRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
          >
            {Array.from({ length: rowCount }, (_, rowIndex) => {
              const active = rowIndex === selectedRowIndex;
              return (
                <div
                  key={`row-${rowIndex}`}
                  ref={(node) => {
                    rowRefs.current[rowIndex] = node;
                  }}
                  className={cn(
                    "grid gap-2 rounded-2xl border p-2 transition-colors",
                    active
                      ? "border-sky-300 bg-sky-50/70 ring-1 ring-sky-200"
                      : "border-border/60 bg-background hover:border-border",
                  )}
                  style={{ gridTemplateColumns: columnTemplate }}
                  onClick={() => setSelectedRowIndex(rowIndex)}
                >
                  <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-background/80 p-2">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                      <div className="text-[11px] text-muted-foreground">第 {rowIndex + 1} 段 · 你的</div>
                      <ParagraphAlignControls
                        rowIndex={rowIndex}
                        canMergeUp={rowIndex > 0 && (userParagraphs.length > 0 || Boolean(paragraphAt(userParagraphs, rowIndex)))}
                        onInsertBlank={() => {
                          applyUserParagraphs(insertBlankParagraphAt(userParagraphs, rowIndex), rowIndex);
                        }}
                        onMergeUp={() => {
                          applyUserParagraphs(
                            mergeParagraphWithPrevious(userParagraphs, rowIndex),
                            Math.max(0, rowIndex - 1),
                          );
                        }}
                      />
                    </div>
                    <textarea
                      value={paragraphAt(userParagraphs, rowIndex)}
                      onFocus={() => setSelectedRowIndex(rowIndex)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedRowIndex(rowIndex);
                      }}
                      onChange={(event) => {
                        applyUserParagraphs(updateParagraphAt(userParagraphs, rowIndex, event.target.value));
                      }}
                      className="min-h-[5.5rem] w-full flex-1 resize-y rounded-lg bg-transparent text-sm leading-7 outline-none"
                      spellCheck={false}
                      placeholder="这一段还没有内容，可直接写"
                    />
                  </div>

                  {visibleParagraphSets.length > 0 ? (
                    visibleParagraphSets.map((item) => (
                      <div
                        key={`${item.sessionId}-${rowIndex}`}
                        className="flex min-h-0 flex-col rounded-xl border border-sky-200/70 bg-sky-50/30 p-2"
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                          <div className="text-[11px] text-muted-foreground">
                            第 {rowIndex + 1} 段 · 范文
                          </div>
                          <ParagraphAlignControls
                            rowIndex={rowIndex}
                            canMergeUp={
                              rowIndex > 0
                              && (item.paragraphs.length > 0 || Boolean(paragraphAt(item.paragraphs, rowIndex)))
                            }
                            onInsertBlank={() => {
                              applyBenchmarkParagraphs(
                                item.sessionId,
                                insertBlankParagraphAt(item.paragraphs, rowIndex),
                                rowIndex,
                              );
                            }}
                            onMergeUp={() => {
                              applyBenchmarkParagraphs(
                                item.sessionId,
                                mergeParagraphWithPrevious(item.paragraphs, rowIndex),
                                Math.max(0, rowIndex - 1),
                              );
                            }}
                          />
                        </div>
                        <textarea
                          value={paragraphAt(item.paragraphs, rowIndex)}
                          onFocus={() => {
                            // 点范文只切换当前范文与行高亮，不触发窗内滚动定位。
                            setSelectedRowIndex(rowIndex);
                            onFocusBenchmark(item.sessionId);
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRowIndex(rowIndex);
                            onFocusBenchmark(item.sessionId);
                          }}
                          onChange={(event) => {
                            applyBenchmarkParagraphs(
                              item.sessionId,
                              updateParagraphAt(item.paragraphs, rowIndex, event.target.value),
                            );
                          }}
                          className="min-h-[5.5rem] w-full flex-1 resize-y rounded-lg bg-transparent text-sm leading-7 outline-none"
                          spellCheck={false}
                          placeholder="这一段范文为空，可直接改"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground">
                      暂无范文段落
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {focusedCompareResult && focusedBenchmark ? (
            <div className="mt-3 max-h-40 shrink-0 space-y-2 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-3">
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

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-6">
          <div className="text-xs text-muted-foreground">
            左右按第 N 段对齐；错位时用「空出本段 / 并入上段」。改范文写回本章缓存，改你的正文同步到编辑器草稿。
          </div>
          <div className="flex flex-wrap gap-2">
            <AiButton
              size="sm"
              variant="outline"
              onClick={() => onRunCompare(focusedSessionId ?? undefined)}
              disabled={isComparing || isRewriting || !focusedBenchmark}
            >
              {isComparing
                ? "正在逐段点评..."
                : focusedCompareResult
                  ? "重新点评当前范文"
                  : "逐段点评当前范文"}
            </AiButton>
            <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
              关闭对照窗
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
