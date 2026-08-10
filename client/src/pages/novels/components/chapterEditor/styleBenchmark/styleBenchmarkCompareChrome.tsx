import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StyleBenchmarkCompareDeskMode } from "./useStyleBenchmarkCompareDeskMode";

export function ParagraphAlignControls(props: {
  rowIndex: number;
  canMergeUp: boolean;
  onInsertBlank: () => void;
  onMergeUp: () => void;
  compact?: boolean;
}) {
  const { rowIndex, canMergeUp, onInsertBlank, onMergeUp, compact } = props;
  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", compact ? "flex-nowrap" : "flex-wrap")}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-auto min-h-6 px-1.5 text-[11px] leading-snug text-muted-foreground whitespace-normal",
          compact && "max-w-[4.5rem]",
        )}
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
        className={cn(
          "h-auto min-h-6 px-1.5 text-[11px] leading-snug text-muted-foreground whitespace-normal",
          compact && "max-w-[4.5rem]",
        )}
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

export function CompareSegmentRail(props: {
  rowCount: number;
  selectedRowIndex: number;
  weakRowIndexes: Set<number>;
  orientation: "vertical" | "horizontal";
  onSelect: (rowIndex: number) => void;
}) {
  const { rowCount, selectedRowIndex, weakRowIndexes, orientation, onSelect } = props;
  if (rowCount <= 0) {
    return null;
  }
  return (
    <div
      className={cn(
        "shrink-0 gap-1",
        orientation === "vertical"
          ? "flex max-h-full w-9 flex-col overflow-y-auto py-1"
          : "mb-2 flex max-w-full overflow-x-auto pb-1",
      )}
      aria-label="段落导航"
    >
      {Array.from({ length: rowCount }, (_, rowIndex) => {
        const weak = weakRowIndexes.has(rowIndex);
        const active = rowIndex === selectedRowIndex;
        return (
          <button
            key={`seg-${rowIndex}`}
            type="button"
            className={cn(
              "shrink-0 rounded-md border text-[10px] font-medium leading-none transition-colors",
              orientation === "vertical" ? "h-7 w-7" : "h-7 min-w-7 px-1.5",
              active
                ? "border-sky-400 bg-sky-100 text-sky-900"
                : weak
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-border/70 bg-background text-muted-foreground",
            )}
            aria-label={`第 ${rowIndex + 1} 段${weak ? "（弱段）" : ""}`}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(rowIndex)}
          >
            {rowIndex + 1}
          </button>
        );
      })}
    </div>
  );
}

export function CompareDeskCollapseToggle(props: {
  expanded: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  edge: "top" | "bottom";
}) {
  const { expanded, onToggle, expandLabel, collapseLabel, edge } = props;
  return (
    <button
      type="button"
      className={cn(
        "flex h-4 w-full shrink-0 items-center justify-center text-muted-foreground",
        edge === "top" ? "border-b border-border/50" : "border-t border-border/50",
      )}
      aria-expanded={expanded}
      aria-label={expanded ? collapseLabel : expandLabel}
      onClick={onToggle}
    >
      <span className="text-xs leading-none" aria-hidden="true">
        {expanded ? (edge === "top" ? "▴" : "▾") : (edge === "top" ? "▾" : "▴")}
      </span>
    </button>
  );
}

export function compareTextareaClassName(mode: StyleBenchmarkCompareDeskMode): string {
  if (mode === "short-landscape") {
    return "max-h-[28dvh] min-h-[4.5rem] w-full flex-1 resize-y rounded-lg bg-transparent text-base leading-7 outline-none";
  }
  if (mode === "portrait-stack") {
    return "max-h-[36dvh] min-h-[5rem] w-full flex-1 resize-y rounded-lg bg-transparent text-base leading-7 outline-none";
  }
  return "min-h-[5.5rem] w-full flex-1 resize-y rounded-lg bg-transparent text-sm leading-7 outline-none";
}
