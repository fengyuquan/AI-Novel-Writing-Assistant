import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import WorkflowProgressBar, {
  normalizeProgressPercent,
  type WorkflowProgressTone,
} from "@/components/workflow/WorkflowProgressBar";
import { cn } from "@/lib/utils";
import type { NovelEditTakeoverState } from "../components/NovelEditView.types";

interface MobileAutoDirectorStatusCardProps {
  takeover: NovelEditTakeoverState;
}

function modeLabel(mode: NovelEditTakeoverState["mode"]): string {
  switch (mode) {
    case "loading":
      return "加载中";
    case "running":
      return "接管中";
    case "waiting":
      return "等待确认";
    case "action_required":
      return "待处理";
    case "failed":
    default:
      return "异常";
  }
}

function progressTone(mode: NovelEditTakeoverState["mode"]): WorkflowProgressTone {
  if (mode === "failed") {
    return "failed";
  }
  if (mode === "waiting" || mode === "action_required") {
    return "waiting";
  }
  if (mode === "loading") {
    return "loading";
  }
  return "running";
}

function cardClass(mode: NovelEditTakeoverState["mode"]): string {
  if (mode === "failed") {
    return "border-destructive/35 bg-destructive/5";
  }
  if (mode === "waiting" || mode === "action_required") {
    return "border-amber-500/35 bg-amber-50/80";
  }
  return "border-primary/25 bg-primary/[0.04]";
}

function primaryActionLabel(mode: NovelEditTakeoverState["mode"]): string {
  if (mode === "failed") {
    return "恢复自动导演";
  }
  if (mode === "waiting" || mode === "action_required") {
    return "继续处理";
  }
  return "查看自动导演";
}

export default function MobileAutoDirectorStatusCard({ takeover }: MobileAutoDirectorStatusCardProps) {
  const resolvedProgress = typeof takeover.progress === "number"
    ? normalizeProgressPercent(takeover.progress)
    : null;
  const primaryAction = takeover.actions?.find((action) => !action.disabled) ?? takeover.actions?.[0] ?? null;
  const recoverHref = takeover.taskId
    ? `/novels/auto-director?taskId=${encodeURIComponent(takeover.taskId)}`
    : null;
  const needsRecovery = takeover.mode === "failed"
    || takeover.mode === "waiting"
    || takeover.mode === "action_required";

  return (
    <section className={cn("mobile-auto-director-status-card rounded-xl border p-3", cardClass(takeover.mode))}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{takeover.title}</h2>
            <Badge variant={takeover.mode === "failed" ? "destructive" : "secondary"} className="shrink-0">
              {modeLabel(takeover.mode)}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{takeover.description}</p>
        </div>
        {resolvedProgress !== null ? (
          <div className="shrink-0 rounded-full bg-background/80 px-2 py-1 text-xs tabular-nums text-muted-foreground">
            {resolvedProgress}%
          </div>
        ) : null}
      </div>

      {resolvedProgress !== null ? (
        <WorkflowProgressBar progress={resolvedProgress} tone={progressTone(takeover.mode)} className="mt-3" />
      ) : null}

      {takeover.currentAction || takeover.checkpointLabel ? (
        <div className="mt-2 min-w-0 space-y-1 text-xs">
          {takeover.currentAction ? (
            <div className="truncate text-foreground">{takeover.currentAction}</div>
          ) : null}
          {takeover.checkpointLabel ? (
            <div className="truncate text-muted-foreground">检查点：{takeover.checkpointLabel}</div>
          ) : null}
        </div>
      ) : null}

      {needsRecovery || primaryAction || recoverHref ? (
        <div className="mt-3 flex flex-col gap-2">
          {primaryAction ? (
            <Button
              type="button"
              className="h-11 min-h-11 w-full text-base"
              variant={primaryAction.variant ?? (takeover.mode === "running" ? "outline" : "default")}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          ) : recoverHref ? (
            <Button asChild className="h-11 min-h-11 w-full text-base">
              <Link to={recoverHref}>{primaryActionLabel(takeover.mode)}</Link>
            </Button>
          ) : null}
          {primaryAction && recoverHref ? (
            <Button asChild variant="outline" className="h-11 min-h-11 w-full text-base">
              <Link to={recoverHref}>打开自动导演页</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
