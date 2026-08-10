import { useState } from "react";
import { Link } from "react-router-dom";
import { updateAdminRecord, type NovelWorkspacePayload, type WorkspaceTaskItem } from "@/lib/api";
import { statusTone } from "@/lib/statusTone";

interface TasksPanelProps {
  novelId: string;
  workspace: NovelWorkspacePayload;
  onWorkspaceRefresh: () => Promise<void> | void;
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 19).replace("T", " ");
}

function modelForTask(task: WorkspaceTaskItem): "NovelWorkflowTask" | "GenerationJob" {
  return task.kind === "workflow" ? "NovelWorkflowTask" : "GenerationJob";
}

export function TasksPanel(props: TasksPanelProps) {
  const tasks = props.workspace.tasks;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyAction(task: WorkspaceTaskItem, action: "cancel" | "fail" | "clear_recovery") {
    const label =
      action === "cancel" ? "标记为 cancelled" : action === "fail" ? "标记为 failed" : "清除待恢复标记";
    if (!window.confirm(`确认对「${task.title}」执行：${label}？`)) return;
    setBusyId(task.id);
    setError(null);
    setHint(null);
    try {
      const model = modelForTask(task);
      if (action === "cancel") {
        await updateAdminRecord(model, task.id, { status: "cancelled", pendingManualRecovery: false });
      } else if (action === "fail") {
        await updateAdminRecord(model, task.id, { status: "failed" });
      } else {
        await updateAdminRecord(model, task.id, { pendingManualRecovery: false });
      }
      setHint(`已处理：${task.title}`);
      await props.onWorkspaceRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">任务时间线</h2>
          <p className="text-sm text-muted-foreground">
            失败与待恢复置顶；可直接取消、标失败或清除 recovery，无需进高级表。
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link className="rounded-md border bg-white px-3 py-1.5" to={`/novels/${props.novelId}/advanced/NovelWorkflowTask`}>
            工作流表
          </Link>
          <Link className="rounded-md border bg-white px-3 py-1.5" to={`/novels/${props.novelId}/advanced/GenerationJob`}>
            生成任务表
          </Link>
        </div>
      </div>

      {hint ? <p className="mb-3 text-xs text-emerald-700">{hint}</p> : null}
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      <ol className="relative space-y-3 border-l border-border/80 pl-5">
        {tasks.map((task) => {
          const tone = statusTone(task.status);
          const canCancel = !/cancelled|succeeded|success/i.test(task.status);
          const canFail = /queued|running|waiting/i.test(task.status);
          const canClearRecovery = task.pendingManualRecovery;
          const busy = busyId === task.id;

          return (
            <li key={`${task.kind}-${task.id}`} className="relative">
              <span
                className="absolute -left-[1.55rem] top-2 h-2.5 w-2.5 rounded-full border-2 border-white"
                style={{
                  background:
                    tone === "failed"
                      ? "hsl(var(--status-failed))"
                      : tone === "running"
                        ? "hsl(var(--status-running))"
                        : tone === "succeeded"
                          ? "hsl(var(--status-succeeded))"
                          : "hsl(var(--status-queued))",
                }}
              />
              <div className="rounded-xl border bg-[hsl(var(--card-surface))] p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{task.title}</span>
                  <span className="status-pill" data-tone={tone}>
                    {task.status}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {task.kind === "workflow" ? "工作流" : "章节生成"}
                  </span>
                  {task.pendingManualRecovery ? (
                    <span className="status-pill" data-tone="failed">
                      待人工恢复
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {[task.currentStage, task.currentItemLabel].filter(Boolean).join(" · ") || "无阶段信息"}
                  {" · "}
                  进度 {Math.round((task.progress || 0) * 100)}%
                </div>
                {task.checkpointSummary || task.checkpointType ? (
                  <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                    检查点：{[task.checkpointType, task.checkpointSummary].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                {task.error ? (
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
                    {task.error}
                  </pre>
                ) : null}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  更新 {formatTime(task.updatedAt)} · 开始 {formatTime(task.startedAt)} · 结束{" "}
                  {formatTime(task.finishedAt)}
                </div>
                {(canCancel || canFail || canClearRecovery) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canCancel ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                        onClick={() => void applyAction(task, "cancel")}
                      >
                        取消
                      </button>
                    ) : null}
                    {canFail ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                        onClick={() => void applyAction(task, "fail")}
                      >
                        标失败
                      </button>
                    ) : null}
                    {canClearRecovery ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                        onClick={() => void applyAction(task, "clear_recovery")}
                      >
                        清 recovery
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {tasks.length === 0 ? (
          <li className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">暂无最近任务</li>
        ) : null}
      </ol>
    </div>
  );
}
