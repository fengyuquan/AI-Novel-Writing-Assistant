import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CompareContentSaveStatus = "idle" | "saving" | "saved" | "error";

function contentSaveLabel(params: {
  isDirtyContent: boolean;
  isSavingContent: boolean;
  contentSaveStatus: CompareContentSaveStatus;
}): { label: string; tone: "muted" | "warn" | "ok" | "danger" } {
  if (params.isSavingContent || params.contentSaveStatus === "saving") {
    return { label: "保存中", tone: "warn" };
  }
  if (params.contentSaveStatus === "error") {
    return { label: "保存失败", tone: "danger" };
  }
  if (params.isDirtyContent) {
    return { label: "待保存", tone: "warn" };
  }
  if (params.contentSaveStatus === "saved") {
    return { label: "已保存", tone: "ok" };
  }
  return { label: "未改动", tone: "muted" };
}

function toneClassName(tone: "muted" | "warn" | "ok" | "danger"): string {
  if (tone === "warn") {
    return "border-amber-300/80 bg-amber-50 text-amber-900";
  }
  if (tone === "ok") {
    return "border-emerald-300/80 bg-emerald-50 text-emerald-900";
  }
  if (tone === "danger") {
    return "border-destructive/40 bg-destructive/5 text-destructive";
  }
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

export function StyleBenchmarkCompareStatusBar(props: {
  userWordCount: number;
  isDirtyContent: boolean;
  isSavingContent: boolean;
  contentSaveStatus: CompareContentSaveStatus;
  learningFocus?: string | null;
  compact?: boolean;
}) {
  const {
    userWordCount,
    isDirtyContent,
    isSavingContent,
    contentSaveStatus,
    learningFocus,
    compact,
  } = props;
  const content = contentSaveLabel({ isDirtyContent, isSavingContent, contentSaveStatus });
  const saveLabel = content.label === "已保存" ? "已保存，可放心关闭" : content.label;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b bg-muted/20 px-3 py-1.5 sm:px-4",
        compact && "gap-0.5 px-2 py-1",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="border-border/70 bg-background font-normal">
          正文 {userWordCount} 字
        </Badge>
        <Badge variant="outline" className={cn("font-normal", toneClassName(content.tone))}>
          {saveLabel}
        </Badge>
      </div>
      {learningFocus ? (
        <div className="truncate text-[11px] leading-4 text-muted-foreground" title={learningFocus}>
          <span className="text-foreground/80">这次学：</span>
          {learningFocus}
        </div>
      ) : null}
    </div>
  );
}
