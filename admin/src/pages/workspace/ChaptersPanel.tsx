import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChapterReader } from "@/components/reader/ChapterReader";
import { RecordForm } from "@/components/RecordForm";
import {
  fetchAdminMeta,
  fetchAdminRecord,
  fetchWorkspaceChapter,
  searchNovelChapters,
  updateAdminRecord,
  type AdminModelMeta,
  type ChapterSearchHit,
  type NovelWorkspacePayload,
  type WorkspaceChapterDetail,
} from "@/lib/api";
import { statusTone } from "@/lib/statusTone";

interface ChaptersPanelProps {
  novelId: string;
  chapterId?: string;
  workspace: NovelWorkspacePayload;
  onWorkspaceRefresh: () => Promise<void> | void;
}

export function ChaptersPanel(props: ChaptersPanelProps) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<WorkspaceChapterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chapterModel, setChapterModel] = useState<AdminModelMeta | null>(null);
  const [editRecord, setEditRecord] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchHits, setSearchHits] = useState<ChapterSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const chapters = props.workspace.chapters;
  const activeId = props.chapterId || chapters[0]?.id || "";
  const activeIndex = useMemo(
    () => chapters.findIndex((chapter) => chapter.id === activeId),
    [chapters, activeId],
  );
  const prevChapter = activeIndex > 0 ? chapters[activeIndex - 1] : null;
  const nextChapter =
    activeIndex >= 0 && activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;

  useEffect(() => {
    void fetchAdminMeta()
      .then((meta) => setChapterModel(meta.models.find((model) => model.name === "Chapter") ?? null))
      .catch(() => setChapterModel(null));
  }, []);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    if (props.chapterId !== activeId) {
      navigate(`/novels/${props.novelId}/chapters/${activeId}`, { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    setEditing(false);
    void fetchWorkspaceChapter(props.novelId, activeId)
      .then(setDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载章节失败"))
      .finally(() => setLoading(false));
  }, [activeId, navigate, props.chapterId, props.novelId]);

  async function openEdit() {
    if (!activeId || !chapterModel) return;
    const result = await fetchAdminRecord("Chapter", activeId);
    setEditRecord(result.item);
    setEditing(true);
  }

  async function runSearch() {
    const q = searchInput.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const result = await searchNovelChapters(props.novelId, q);
      setSearchHits(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r bg-[hsl(var(--card-surface))]">
        <div className="space-y-2 border-b px-3 py-3">
          <div className="text-xs text-muted-foreground">共 {chapters.length} 章 · 点选阅读正文</div>
          <div className="flex gap-1">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder="搜标题/正文…"
              className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              className="rounded-md border px-2 py-1.5 text-xs"
              disabled={searching}
              onClick={() => void runSearch()}
            >
              {searching ? "…" : "搜"}
            </button>
          </div>
          {searchHits ? (
            <div className="max-h-40 space-y-1 overflow-auto rounded border bg-muted/30 p-1.5 text-[11px]">
              <div className="mb-1 flex justify-between text-muted-foreground">
                <span>{searchHits.length} 条命中</span>
                <button type="button" className="underline" onClick={() => setSearchHits(null)}>
                  清除
                </button>
              </div>
              {searchHits.map((hit) => (
                <Link
                  key={hit.id}
                  to={`/novels/${props.novelId}/chapters/${hit.id}`}
                  className="block rounded px-1.5 py-1 hover:bg-white"
                >
                  <div className="font-medium">
                    {hit.order}. {hit.title}
                  </div>
                  {hit.snippet ? <div className="line-clamp-2 text-muted-foreground">{hit.snippet}</div> : null}
                </Link>
              ))}
              {searchHits.length === 0 ? <div className="text-muted-foreground">无匹配</div> : null}
            </div>
          ) : null}
        </div>
        <nav className="flex-1 overflow-auto p-2">
          {chapters.map((chapter) => {
            const active = chapter.id === activeId;
            return (
              <Link
                key={chapter.id}
                to={`/novels/${props.novelId}/chapters/${chapter.id}`}
                className={`mb-1 block rounded-md px-2.5 py-2 ${
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {chapter.order}. {chapter.title}
                  </span>
                  <span className="status-pill" data-tone={statusTone(chapter.generationState)}>
                    {chapter.generationState}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {chapter.hasContent ? "有正文" : "无正文"}
                  {chapter.qualityScore != null ? ` · 质量 ${chapter.qualityScore}` : ""}
                </div>
              </Link>
            );
          })}
          {chapters.length === 0 ? (
            <div className="px-2 py-6 text-xs text-muted-foreground">这本小说还没有章节。</div>
          ) : null}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {loading ? <div className="text-sm text-muted-foreground">加载正文…</div> : null}
        {!loading && !activeId ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">还没有章节可阅读</h2>
            <p className="mt-2 text-sm text-muted-foreground">可在写作端生成章节，或到高级表中新建 Chapter。</p>
            <Link
              to={`/novels/${props.novelId}/advanced/Chapter`}
              className="mt-4 inline-block rounded-md border bg-white px-3 py-1.5 text-sm"
            >
              打开 Chapter 表
            </Link>
          </div>
        ) : null}
        {!loading && detail ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {prevChapter ? (
                  <Link
                    to={`/novels/${props.novelId}/chapters/${prevChapter.id}`}
                    className="rounded-md border bg-white px-3 py-1.5 text-sm"
                  >
                    ← 上一章
                  </Link>
                ) : (
                  <span className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground opacity-40">← 上一章</span>
                )}
                {nextChapter ? (
                  <Link
                    to={`/novels/${props.novelId}/chapters/${nextChapter.id}`}
                    className="rounded-md border bg-white px-3 py-1.5 text-sm"
                  >
                    下一章 →
                  </Link>
                ) : (
                  <span className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground opacity-40">下一章 →</span>
                )}
              </div>
              <button type="button" className="rounded-md border bg-white px-3 py-1.5 text-sm" onClick={() => void openEdit()}>
                编辑章节
              </button>
            </div>
            <ChapterReader
              order={detail.order}
              title={detail.title}
              content={detail.content}
              meta={`${detail.wordCount} 字 · ${detail.generationState}${
                detail.qualityScore != null ? ` · 质量 ${detail.qualityScore}` : ""
              }`}
            />
            <div className="mt-4 flex justify-between gap-2">
              {prevChapter ? (
                <Link
                  to={`/novels/${props.novelId}/chapters/${prevChapter.id}`}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                >
                  ← {prevChapter.order}. {prevChapter.title}
                </Link>
              ) : (
                <span />
              )}
              {nextChapter ? (
                <Link
                  to={`/novels/${props.novelId}/chapters/${nextChapter.id}`}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                >
                  {nextChapter.order}. {nextChapter.title} →
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {editing && chapterModel && editRecord ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">编辑章节</h2>
              <p className="text-xs text-muted-foreground">修改标题、正文与状态等关键字段</p>
            </div>
            <div className="min-h-0 flex-1">
              <RecordForm
                model={chapterModel}
                mode="edit"
                initialValues={editRecord}
                submitting={submitting}
                onCancel={() => setEditing(false)}
                onSubmit={async (values) => {
                  setSubmitting(true);
                  try {
                    await updateAdminRecord("Chapter", activeId, { ...values, novelId: props.novelId });
                    setEditing(false);
                    const next = await fetchWorkspaceChapter(props.novelId, activeId);
                    setDetail(next);
                    await props.onWorkspaceRefresh();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
