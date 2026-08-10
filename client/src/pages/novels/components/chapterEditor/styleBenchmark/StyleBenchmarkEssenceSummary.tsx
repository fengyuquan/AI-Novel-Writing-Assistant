import type {
  ChapterEditorStyleBenchmarkEssenceCard,
  ChapterEditorStyleBenchmarkEssenceCompliance,
  ChapterEditorStyleBenchmarkRewriteResponse,
} from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function StyleBenchmarkEssenceSummary(props: {
  essence: ChapterEditorStyleBenchmarkEssenceCard | null | undefined;
  compliance: ChapterEditorStyleBenchmarkEssenceCompliance | null | undefined;
  rewriteMode?: ChapterEditorStyleBenchmarkRewriteResponse["rewriteMode"];
  disabled?: boolean;
  onRetryMissed?: () => void;
}) {
  const { essence, compliance, rewriteMode, disabled, onRetryMissed } = props;
  if (!essence && !compliance) {
    return null;
  }

  const missed = compliance?.missed ?? [];
  const covered = compliance?.covered ?? [];

  return (
    <div className="space-y-2 rounded-xl border border-sky-200/70 bg-background/80 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-foreground">范文精髓</span>
        {essence ? (
          <Badge variant="outline">
            把握度 {essence.confidence === "high" ? "高" : essence.confidence === "medium" ? "中" : "低"}
          </Badge>
        ) : null}
        {rewriteMode === "segmented" ? <Badge variant="secondary">分段仿写</Badge> : null}
      </div>

      {essence ? (
        <div className="space-y-1.5 text-xs leading-5 text-foreground/90">
          <div>
            <span className="text-muted-foreground">将学习：</span>
            {essence.fingerprintLines.join("；")}
          </div>
          {essence.gaps.length > 0 ? (
            <div className="text-amber-800">
              样章不足：{essence.gaps.join("；")}
            </div>
          ) : null}
        </div>
      ) : null}

      {compliance ? (
        <div className="space-y-1.5 text-xs leading-5">
          {covered.length > 0 ? (
            <div className="text-foreground/90">
              <span className="text-muted-foreground">已做到：</span>
              {covered.join("；")}
            </div>
          ) : null}
          {missed.length > 0 ? (
            <div className="text-amber-900">
              <span className="text-muted-foreground">未覆盖：</span>
              {missed.join("；")}
            </div>
          ) : (
            <div className="text-muted-foreground">精髓指纹已基本覆盖。</div>
          )}
          {compliance.notes ? (
            <div className="text-muted-foreground">{compliance.notes}</div>
          ) : null}
          {missed.length > 0 && onRetryMissed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full"
              disabled={disabled}
              onClick={onRetryMissed}
            >
              按未覆盖指纹再生成
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
