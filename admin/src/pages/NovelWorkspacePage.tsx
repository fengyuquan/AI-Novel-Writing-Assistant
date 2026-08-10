import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
import { ImportNovelDialog } from "@/components/ImportNovelDialog";
import {
  exportNovelSlice,
  fetchAdminList,
  fetchNovelWorkspace,
  setStoredToken,
  type NovelWorkspacePayload,
} from "@/lib/api";
import { statusTone } from "@/lib/statusTone";
import { AdvancedTablesPanel } from "@/pages/workspace/AdvancedTablesPanel";
import { ChaptersPanel } from "@/pages/workspace/ChaptersPanel";
import { CharactersPanel } from "@/pages/workspace/CharactersPanel";
import { OutlinePanel } from "@/pages/workspace/OutlinePanel";
import { TasksPanel } from "@/pages/workspace/TasksPanel";

type WorkspaceSection = "overview" | "chapters" | "characters" | "outline" | "tasks" | "advanced";

const CONTENT_SECTIONS: Array<{ id: WorkspaceSection; label: string; path: string }> = [
  { id: "overview", label: "总览", path: "" },
  { id: "chapters", label: "章节", path: "/chapters" },
  { id: "characters", label: "角色", path: "/characters" },
  { id: "outline", label: "大纲", path: "/outline" },
  { id: "tasks", label: "任务", path: "/tasks" },
  { id: "advanced", label: "高级表", path: "/advanced" },
];

function resolveSection(pathname: string): WorkspaceSection {
  if (pathname.includes("/advanced")) return "advanced";
  if (pathname.includes("/chapters")) return "chapters";
  if (pathname.includes("/characters")) return "characters";
  if (pathname.includes("/outline")) return "outline";
  if (pathname.includes("/tasks")) return "tasks";
  return "overview";
}

function OverviewPanel(props: { novelId: string; workspace: NovelWorkspacePayload }) {
  const novel = props.workspace.novel;
  const chapters = props.workspace.chapters;
  const withBody = chapters.filter((chapter) => chapter.hasContent).length;
  const failedTasks = props.workspace.tasks
    .filter((task) => statusTone(task.status) === "failed" || task.pendingManualRecovery)
    .slice(0, 5);
  const progressTarget = novel.estimatedChapterCount || chapters.length || 1;
  const progressPct = Math.min(100, Math.round((withBody / progressTarget) * 100));

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border bg-[hsl(var(--card-surface))] p-5 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">{novel.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {novel.description || "暂无简介"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-1">状态 {novel.status || "—"}</span>
            <span className="rounded bg-muted px-2 py-1">大纲 {novel.outlineStatus || "—"}</span>
            <span className="rounded bg-muted px-2 py-1">剧情线 {novel.storylineStatus || "—"}</span>
            <span className="rounded bg-muted px-2 py-1">
              章节 {chapters.length}
              {novel.estimatedChapterCount != null ? ` / ${novel.estimatedChapterCount}` : ""}
            </span>
            <span className="rounded bg-muted px-2 py-1">角色 {props.workspace.counts.characters}</span>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>正文进度（有正文章节）</span>
              <span>
                {withBody} / {progressTarget} · {progressPct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[hsl(var(--status-running))] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {chapters.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {chapters.slice(0, 48).map((chapter) => (
                  <Link
                    key={chapter.id}
                    to={`/novels/${props.novelId}/chapters/${chapter.id}`}
                    title={`${chapter.order}. ${chapter.title}`}
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{
                      background: chapter.hasContent
                        ? "hsl(var(--status-succeeded))"
                        : "hsl(var(--status-queued) / 0.35)",
                    }}
                  />
                ))}
                {chapters.length > 48 ? (
                  <span className="text-[11px] text-muted-foreground">+{chapters.length - 48}</span>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                还没有章节。可先写大纲，或到高级表新建 Chapter。
              </p>
            )}
          </div>

          {novel.outlinePreview ? (
            <div className="reader-prose mt-5 max-h-64 overflow-auto rounded-lg border px-5 py-4 text-sm">
              {novel.outlinePreview.split(/\n{2,}|\n/).slice(0, 12).map((line, index) => (
                <p key={index} style={{ marginBottom: "0.7em" }}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              尚未填写大纲。可打开「大纲」分区阅读或编辑。
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">导演 / 流水线</div>
              <Link to={`/novels/${props.novelId}/tasks`} className="text-xs text-sky-700 underline">
                打开任务
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-1">
                运行中 {props.workspace.pipeline?.runningCount ?? 0}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                排队 {props.workspace.pipeline?.queuedCount ?? 0}
              </span>
              <span className="rounded bg-red-50 px-2 py-1 text-red-800">
                需关注 {props.workspace.pipeline?.failedOrRecoveryCount ?? 0}
              </span>
            </div>
            {(props.workspace.pipeline?.attention?.length ?? 0) > 0 ? (
              <ul className="mt-3 space-y-1.5 text-xs">
                {props.workspace.pipeline.attention.slice(0, 3).map((task) => (
                  <li key={`${task.kind}-${task.id}`} className="rounded bg-red-50/70 px-2 py-1.5 text-red-900">
                    <div className="font-medium">{task.title}</div>
                    <div className="opacity-80">
                      {[task.status, task.checkpointSummary || task.currentStage, task.error]
                        .filter(Boolean)
                        .join(" · ")
                        .slice(0, 140)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (props.workspace.pipeline?.latestRunning?.length ?? 0) > 0 ? (
              <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {props.workspace.pipeline.latestRunning.slice(0, 3).map((task) => (
                  <li key={`${task.kind}-${task.id}`}>
                    {task.title} · {task.currentStage || task.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">近期无运行中或失败任务。</p>
            )}
          </div>
          <Link
            to={`/novels/${props.novelId}/chapters`}
            className="block rounded-xl border bg-white p-4 hover:border-sky-300"
          >
            <div className="text-sm font-semibold">阅读章节</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {chapters[0]
                ? `从第 ${chapters[0].order} 章开始：${chapters[0].title}`
                : "暂无章节 · 去高级表新建"}
            </div>
          </Link>
          <Link
            to={`/novels/${props.novelId}/characters`}
            className="block rounded-xl border bg-white p-4 hover:border-sky-300"
          >
            <div className="text-sm font-semibold">浏览角色卡</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {props.workspace.counts.characters > 0
                ? `${props.workspace.counts.characters} 个角色`
                : "暂无角色"}
            </div>
          </Link>
          <Link
            to={`/novels/${props.novelId}/tasks`}
            className="block rounded-xl border bg-white p-4 hover:border-sky-300"
          >
            <div className="text-sm font-semibold">查看任务</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {failedTasks.length > 0 ? `${failedTasks.length} 条需关注` : "最近任务运行正常或暂无记录"}
            </div>
          </Link>
          <Link
            to={`/novels/${props.novelId}/outline`}
            className="block rounded-xl border bg-white p-4 hover:border-sky-300"
          >
            <div className="text-sm font-semibold">大纲与设定</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {props.workspace.volumes.length > 0
                ? `${props.workspace.volumes.length} 卷规划`
                : novel.outline
                  ? "已有大纲文本"
                  : "尚未填写"}
            </div>
          </Link>
        </section>
      </div>

      {failedTasks.length > 0 ? (
        <section className="mt-6">
          <h3 className="mb-3 text-sm font-semibold">需要关注的任务</h3>
          <div className="space-y-2">
            {failedTasks.map((task) => (
              <Link
                key={`${task.kind}-${task.id}`}
                to={`/novels/${props.novelId}/tasks`}
                className="block rounded-lg border border-red-200 bg-red-50/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{task.title}</span>
                  <span className="status-pill" data-tone="failed">
                    {task.status}
                  </span>
                </div>
                {task.error ? (
                  <p className="mt-1 line-clamp-2 text-xs text-red-800">{task.error}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function NovelWorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const novelId = params.novelId ?? "";
  const chapterId = params.chapterId;
  const childModel = params.childModel;
  const recordId = params.recordId;

  const section = resolveSection(location.pathname);

  const [workspace, setWorkspace] = useState<NovelWorkspacePayload | null>(null);
  const [novelList, setNovelList] = useState<Array<{ id: string; title: string }>>([]);
  const [novelQuery, setNovelQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!novelId) return;
    const payload = await fetchNovelWorkspace(novelId);
    setWorkspace(payload);
  }, [novelId]);

  useEffect(() => {
    if (!novelId) return;
    setLoading(true);
    setError(null);
    void refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "加载工作台失败");
        if (String(err).includes("未授权") || String(err).includes("401")) {
          setStoredToken(null);
          navigate("/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate, novelId, refresh]);

  useEffect(() => {
    void fetchAdminList("Novel", {
      page: 1,
      pageSize: 80,
      q: novelQuery || undefined,
      orderBy: "updatedAt",
      orderDir: "desc",
    })
      .then((result) =>
        setNovelList(
          result.items.map((item) => ({
            id: String(item.id ?? ""),
            title: String(item.title || item.id || ""),
          })),
        ),
      )
      .catch(() => setNovelList([]));
  }, [novelQuery]);

  const sidebarNovels = useMemo(
    () => (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-3 py-3">
          <Link to="/novels" className="text-xs font-medium text-foreground underline">
            返回小说库
          </Link>
          <input
            value={novelQuery}
            onChange={(event) => setNovelQuery(event.target.value)}
            placeholder="切换小说…"
            className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
        <nav className="flex-1 overflow-auto p-2">
          {novelList.map((novel) => {
            const active = novel.id === novelId;
            return (
              <Link
                key={novel.id}
                to={`/novels/${novel.id}`}
                className={`mb-1 block rounded-md px-2 py-1.5 text-sm ${
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                <div className="truncate font-medium">{novel.title}</div>
              </Link>
            );
          })}
          {novelList.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">没有匹配的小说</div>
          ) : null}
        </nav>
        <p className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          内容分区浏览；改任意关联表时打开「高级表」。
        </p>
      </div>
    ),
    [novelId, novelList, novelQuery],
  );

  async function handleExport() {
    if (!novelId || !workspace) return;
    setExporting(true);
    try {
      const slice = await exportNovelSlice(novelId);
      const blob = new Blob([JSON.stringify(slice, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const title = workspace.novel.title.replace(/[^\w\u4e00-\u9fa5-]+/g, "_") || novelId;
      anchor.href = url;
      anchor.download = `novel-export-${title}-${novelId.slice(0, 8)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setHint("已导出 JSON 切片");
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  if (!novelId) {
    return <Navigate to="/novels" replace />;
  }

  const topBar = workspace ? (
    <div className="border-b bg-[hsl(var(--card-surface))] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            <Link to="/novels" className="underline">
              小说库
            </Link>
            {" / "}
            <span>{workspace.novel.title}</span>
          </div>
          <h1 className="truncate text-lg font-semibold tracking-tight">{workspace.novel.title}</h1>
          <p className="text-xs text-muted-foreground">
            {workspace.counts.chapters} 章 · {workspace.counts.characters} 角色 · 关联行{" "}
            {workspace.counts.totalRelatedRows}
            {hint ? ` · ${hint}` : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => setImportOpen(true)}
          >
            导入 JSON
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? "导出中…" : "导出 JSON"}
          </button>
        </div>
      </div>
      <nav className="mt-3 flex flex-wrap gap-1">
        {CONTENT_SECTIONS.map((item) => {
          const to = `/novels/${novelId}${item.path}`;
          const active = section === item.id;
          return (
            <Link
              key={item.id}
              to={to}
              className={`rounded-md px-3 py-1.5 text-sm ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  ) : null;

  return (
    <AdminShell subtitle="内容工作台" sidebar={sidebarNovels} topBar={topBar}>
      {loading ? <div className="p-6 text-sm text-muted-foreground">加载工作台…</div> : null}
      {error ? (
        <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {!loading && workspace ? (
        <>
          {section === "overview" ? <OverviewPanel novelId={novelId} workspace={workspace} /> : null}
          {section === "chapters" ? (
            <ChaptersPanel
              novelId={novelId}
              chapterId={chapterId}
              workspace={workspace}
              onWorkspaceRefresh={refresh}
            />
          ) : null}
          {section === "characters" ? (
            <CharactersPanel novelId={novelId} workspace={workspace} onWorkspaceRefresh={refresh} />
          ) : null}
          {section === "outline" ? (
            <OutlinePanel novelId={novelId} workspace={workspace} onWorkspaceRefresh={refresh} />
          ) : null}
          {section === "tasks" ? (
            <TasksPanel novelId={novelId} workspace={workspace} onWorkspaceRefresh={refresh} />
          ) : null}
          {section === "advanced" ? (
            <AdvancedTablesPanel
              novelId={novelId}
              novelTitle={workspace.novel.title}
              childrenModels={workspace.children}
              childModelName={childModel}
              recordId={recordId}
            />
          ) : null}
        </>
      ) : null}

      {importOpen && workspace ? (
        <ImportNovelDialog
          novelId={novelId}
          novelTitle={workspace.novel.title}
          onCancel={() => setImportOpen(false)}
          onDone={() => {
            setHint("导入完成，已刷新工作台");
            void refresh();
          }}
        />
      ) : null}
    </AdminShell>
  );
}
