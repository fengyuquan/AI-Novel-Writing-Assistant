import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
import { fetchAdminAudit, setStoredToken, type AdminAuditEntry } from "@/lib/api";

export function AuditPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchAdminAudit({ limit: 200 })
      .then((result) => setItems(result.items))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "加载审计失败");
        if (String(err).includes("未授权") || String(err).includes("401")) {
          setStoredToken(null);
          navigate("/login", { replace: true });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  return (
    <AdminShell
      subtitle="变更审计"
      sidebar={
        <div className="p-3 text-xs text-muted-foreground">
          记录管理后台的创建 / 更新 / 删除操作，便于排查误改。日志保存在服务端数据目录的 `admin-audit.jsonl`。
        </div>
      }
    >
      <header className="border-b bg-white px-5 py-3">
        <h1 className="text-lg font-semibold">变更审计</h1>
        <p className="text-xs text-muted-foreground">最近 {items.length} 条（最多 200）</p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {loading ? <div className="text-sm text-muted-foreground">加载中…</div> : null}
        {!loading ? (
          <div className="overflow-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">动作</th>
                  <th className="px-3 py-2">模型</th>
                  <th className="px-3 py-2">记录</th>
                  <th className="px-3 py-2">摘要</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{item.at}</td>
                    <td className="px-3 py-2">{item.action}</td>
                    <td className="px-3 py-2">
                      <Link to={`/models/${item.model}?q=${encodeURIComponent(item.recordId)}`} className="text-sky-700 underline">
                        {item.model}
                      </Link>
                    </td>
                    <td className="max-w-[14rem] break-all px-3 py-2 font-mono text-xs">
                      {item.novelId ? (
                        <Link
                          to={`/novels/${item.novelId}/advanced/${item.model}/${item.recordId}`}
                          className="text-sky-700 underline"
                        >
                          {item.recordId}
                        </Link>
                      ) : (
                        item.recordId
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{item.summary}</div>
                      {item.changedFields.length > 0 ? (
                        <div className="mt-1 text-muted-foreground">{item.changedFields.join(", ")}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      暂无审计记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
