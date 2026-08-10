import { useEffect, useState } from "react";
import { fetchDeletePreview, deleteAdminRecord, type DeletePreview } from "@/lib/api";

interface DeleteConfirmDialogProps {
  model: string;
  id: string;
  onCancel: () => void;
  onDeleted: () => void;
}

export function DeleteConfirmDialog(props: DeleteConfirmDialogProps) {
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void fetchDeletePreview(props.model, props.id)
      .then(setPreview)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载删除预览失败"))
      .finally(() => setLoading(false));
  }, [props.model, props.id]);

  const canSubmit =
    Boolean(preview) &&
    !submitting &&
    (!preview?.requireTypedConfirm || typedConfirm.trim() === preview.typedConfirmText);

  async function confirmDelete() {
    if (!preview || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAdminRecord(props.model, props.id, {
        typedConfirm: preview.requireTypedConfirm ? typedConfirm.trim() : undefined,
      });
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">确认删除</h2>
          <p className="text-xs text-muted-foreground">
            {props.model} / {props.id}
          </p>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          {loading ? <p className="text-muted-foreground">正在估算关联影响…</p> : null}
          {preview ? (
            <>
              <p>
                将删除 <span className="font-medium">{preview.label}</span>
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
                    preview.riskLevel === "high"
                      ? "bg-red-100 text-red-800"
                      : preview.riskLevel === "medium"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {preview.riskLevel === "high" ? "高风险" : preview.riskLevel === "medium" ? "中风险" : "低风险"}
                </span>
              </p>
              <p className="text-muted-foreground">{preview.warning}</p>
              <p className="text-xs text-muted-foreground">
                请先备份数据库（例如复制 `server/dev.db`，或使用项目备份流程）。删除不可自动回滚。
              </p>
              {preview.impacts.length > 0 ? (
                <div className="max-h-48 overflow-auto rounded-md border">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-2 py-1.5">关联模型</th>
                        <th className="px-2 py-1.5">外键</th>
                        <th className="px-2 py-1.5">条数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.impacts.map((impact) => (
                        <tr key={`${impact.model}-${impact.foreignKey}`} className="border-t">
                          <td className="px-2 py-1.5">{impact.model}</td>
                          <td className="px-2 py-1.5">{impact.foreignKey}</td>
                          <td className="px-2 py-1.5">{impact.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">未检测到直接外键关联行（合计 {preview.totalRelatedRows}）。</p>
              )}
              {preview.requireTypedConfirm ? (
                <label className="block text-xs">
                  请输入 <span className="font-mono font-semibold">{preview.typedConfirmText}</span> 确认
                  <input
                    value={typedConfirm}
                    onChange={(event) => setTypedConfirm(event.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder={preview.typedConfirmText}
                    autoComplete="off"
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={props.onCancel} className="rounded-md border px-3 py-1.5 text-sm">
            取消
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void confirmDelete()}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-40"
          >
            {submitting ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
