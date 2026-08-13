import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  insertBlankParagraphAt,
  mergeParagraphWithPrevious,
  paragraphAt,
  updateParagraphAt,
} from "./styleBenchmarkParagraphs";
import {
  ParagraphAlignControls,
  compareTextareaClassName,
} from "./styleBenchmarkCompareChrome";
import type { StyleBenchmarkCompareDeskMode } from "./useStyleBenchmarkCompareDeskMode";

export interface CompareVisibleParagraphSet {
  sessionId: string;
  title: string;
  shortTitle: string;
  paragraphs: string[];
  isFocused: boolean;
}

interface StyleBenchmarkCompareParagraphRowProps {
  rowIndex: number;
  active: boolean;
  isWeak?: boolean;
  deskMode: StyleBenchmarkCompareDeskMode;
  columnTemplate: string;
  userParagraphs: string[];
  visibleParagraphSets: CompareVisibleParagraphSet[];
  onSelectRow: () => void;
  onEditFocus?: () => void;
  onUserContentChange: (next: string, nextSelectedRow?: number) => void;
  onBenchmarkContentChange: (sessionId: string, nextContent: string, nextSelectedRow?: number) => void;
  onFocusBenchmark: (sessionId: string) => void;
  rowRef: (node: HTMLDivElement | null) => void;
}

export function StyleBenchmarkCompareParagraphRow(props: StyleBenchmarkCompareParagraphRowProps) {
  const {
    rowIndex,
    active,
    isWeak,
    deskMode,
    columnTemplate,
    userParagraphs,
    visibleParagraphSets,
    onSelectRow,
    onEditFocus,
    onUserContentChange,
    onBenchmarkContentChange,
    onFocusBenchmark,
    rowRef,
  } = props;

  const stack = deskMode === "portrait-stack";
  const shortLandscape = deskMode === "short-landscape";
  const hideCellVersionLabel = shortLandscape;
  const compactAlign = stack || shortLandscape;

  const handleEditFocus = () => {
    onSelectRow();
    onEditFocus?.();
  };

  const userCell = (
    <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-background/80 p-2">
      <div className="mb-1 flex min-w-0 items-center justify-between gap-1">
        <div className="min-w-0 text-[11px] leading-snug text-muted-foreground">
          第 {rowIndex + 1} 段 · 你的
          {isWeak ? <span className="ml-1 font-medium text-amber-800">· 偏弱</span> : null}
        </div>
        <ParagraphAlignControls
          rowIndex={rowIndex}
          compact={compactAlign}
          canMergeUp={rowIndex > 0 && (userParagraphs.length > 0 || Boolean(paragraphAt(userParagraphs, rowIndex)))}
          onInsertBlank={() => {
            onUserContentChange(insertBlankParagraphAt(userParagraphs, rowIndex), rowIndex);
          }}
          onMergeUp={() => {
            onUserContentChange(
              mergeParagraphWithPrevious(userParagraphs, rowIndex),
              Math.max(0, rowIndex - 1),
            );
          }}
        />
      </div>
      <textarea
        value={paragraphAt(userParagraphs, rowIndex)}
        onFocus={handleEditFocus}
        onClick={(event) => {
          event.stopPropagation();
          handleEditFocus();
        }}
        onChange={(event) => {
          onUserContentChange(updateParagraphAt(userParagraphs, rowIndex, event.target.value));
        }}
        className={compareTextareaClassName(deskMode)}
        spellCheck={false}
        placeholder="这一段还没有内容，可直接写"
      />
    </div>
  );

  const benchmarkCells = visibleParagraphSets.length > 0
    ? visibleParagraphSets.map((item) => (
      <div
        key={`${item.sessionId}-${rowIndex}`}
        className={cn(
          "flex min-h-0 flex-col rounded-xl border p-2",
          item.isFocused
            ? "border-sky-300 bg-sky-50/50"
            : "border-sky-200/70 bg-sky-50/30",
        )}
      >
        <div className="mb-1 flex min-w-0 items-center justify-between gap-1">
          <div className="min-w-0 text-[11px] leading-snug text-muted-foreground">
            {hideCellVersionLabel
              ? `第 ${rowIndex + 1} 段`
              : (
                <>
                  第 {rowIndex + 1} 段
                  <span className="ml-1 break-words">
                    · {item.isFocused ? "主" : "旁"} · {item.shortTitle}
                  </span>
                </>
              )}
          </div>
          <ParagraphAlignControls
            rowIndex={rowIndex}
            compact={compactAlign}
            canMergeUp={
              rowIndex > 0
              && (item.paragraphs.length > 0 || Boolean(paragraphAt(item.paragraphs, rowIndex)))
            }
            onInsertBlank={() => {
              onBenchmarkContentChange(
                item.sessionId,
                insertBlankParagraphAt(item.paragraphs, rowIndex),
                rowIndex,
              );
            }}
            onMergeUp={() => {
              onBenchmarkContentChange(
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
            handleEditFocus();
            onFocusBenchmark(item.sessionId);
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleEditFocus();
            onFocusBenchmark(item.sessionId);
          }}
          onChange={(event) => {
            onBenchmarkContentChange(
              item.sessionId,
              updateParagraphAt(item.paragraphs, rowIndex, event.target.value),
            );
          }}
          className={compareTextareaClassName(deskMode)}
          spellCheck={false}
          placeholder="这一段范文为空，可直接改"
        />
      </div>
    ))
    : (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground">
        暂无范文段落
      </div>
    );

  return (
    <div
      ref={rowRef}
      className={cn(
        "rounded-2xl border p-2 transition-colors",
        active
          ? isWeak
            ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-200"
            : "border-sky-300 bg-sky-50/70 ring-1 ring-sky-200"
          : isWeak
            ? "border-amber-300/80 bg-amber-50/40 hover:border-amber-400"
            : "border-border/60 bg-background hover:border-border",
        stack ? "flex flex-col gap-2" : "grid gap-2",
      )}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: stack ? "0 280px" : "0 180px",
        ...(stack ? {} : { gridTemplateColumns: columnTemplate }),
      } as CSSProperties}
      onClick={onSelectRow}
    >
      {userCell}
      {benchmarkCells}
    </div>
  );
}
