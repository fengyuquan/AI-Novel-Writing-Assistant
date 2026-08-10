import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
import { fetchAdminList, setStoredToken } from "@/lib/api";

export function NovelLibraryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchAdminList("Novel", {
      page: 1,
      pageSize: 100,
      q: query || undefined,
      orderBy: "updatedAt",
      orderDir: "desc",
    })
      .then((result) => setItems(result.items))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "加载小说列表失败");
        if (String(err).includes("未授权") || String(err).includes("401")) {
          setStoredToken(null);
          navigate("/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate, query]);

  const sidebar = (
    <div className="p-3 text-xs leading-relaxed text-muted-foreground">
      选择一本小说进入内容工作台：阅读章节、浏览角色、查看任务，再按需进入高级表编辑。
    </div>
  );

  return (
    <AdminShell subtitle="小说库" sidebar={sidebar}>
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">小说库</h1>
            <p className="mt-1 text-sm text-muted-foreground">按内容进入一本小说，而不是先挑数据表。</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题…"
            className="w-64 rounded-md border bg-white px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {loading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
        {!loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((novel) => {
              const id = String(novel.id ?? "");
              const title = String(novel.title || id);
              const status = novel.status ? String(novel.status) : "—";
              const description = novel.description ? String(novel.description) : "";
              const updatedAt = novel.updatedAt ? String(novel.updatedAt) : "";
              return (
                <Link
                  key={id}
                  to={`/novels/${id}`}
                  className="group rounded-xl border bg-[hsl(var(--card-surface))] p-5 shadow-sm transition hover:border-sky-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold leading-snug tracking-tight group-hover:text-sky-900">
                      {title}
                    </h2>
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {status}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {description || "暂无简介"}
                  </p>
                  <div className="mt-4 text-[11px] text-muted-foreground">
                    {updatedAt ? `更新于 ${updatedAt.slice(0, 19).replace("T", " ")}` : id}
                  </div>
                </Link>
              );
            })}
            {items.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                暂无小说。可在写作端创建后回到这里查看。
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
