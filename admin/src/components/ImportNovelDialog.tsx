import { useState } from "react";
import {
  executeNovelImport,
  previewNovelImport,
  type ImportExecuteResult,
  type ImportPreview,
} from "@/lib/api";

interface ImportNovelDialogProps {
  novelId: string;
  novelTitle: string;
  onCancel: () => void;
  onDone: () => void;
}

export function ImportNovelDialog(props: ImportNovelDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [slice, setSlice] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportExecuteResult | null>(null);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onFileChange(file: File | null) {
    setError(null);
    setPreview(null);
    setResult(null);
    setTypedConfirm("");
    setSlice(null);
    setFileName(null);
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setSlice(parsed);
      setFileName(file.name);
      const next = await previewNovelImport(props.novelId, parsed);
      setPreview(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法解析或预览该文件");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    Boolean(preview && slice && preview.totals.create + preview.totals.update > 0) &&
    !submitting &&
    (!preview?.requireTypedConfirm || typedConfirm.trim() === preview.typedConfirmText);

  async function runImport() {
    if (!slice || !preview || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await executeNovelImport(
        props.novelId,
        slice,
        preview.requireTypedConfirm ? typedConfirm.trim() : undefined,
      );
      setResult(next);
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">导入 JSON 切片</h2>
          <p className="text-xs text-muted-foreground">
            写入「{props.novelTitle}」· 只 upsert 内容表，不删除已有行
          </p>
        </div>

        <div className="space-y-3 overflow-auto px-4 py-4 text-sm">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
            导入前请先备份数据库。执行会更新小说字段，并按主键新建/覆盖章节、角色等内容行。
          </p>

          <label className="block text-xs">
            选择导出文件
            <input
              type="file"
              accept="application/json,.json"
              className="mt-1 block w-full text-sm"
              onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)}
            />
          </label>
          {fileName ? <p className="text-xs text-muted-foreground">已选：{fileName}</p> : null}
          {loading ? <p className="text-muted-foreground">正在预览…</p> : null}

          {preview ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">{preview.warning}</p>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                新建 <span className="font-semibold">{preview.totals.create}</span> · 更新{" "}
                <span className="font-semibold">{preview.totals.update}</span> · 冲突跳过{" "}
                {preview.totals.skipConflict} · 忽略 {preview.totals.skipReadonly + preview.totals.skipInvalid}
                {preview.sourceNovelId ? (
                  <>
                    <br />
                    来源小说 ID：{preview.sourceNovelId}
                  </>
                ) : null}
              </div>

              {preview.diff ? (
                <div className="space-y-2 rounded-md border px-3 py-2 text-xs">
                  <div className="font-medium">差异摘要</div>
                  <div className="text-muted-foreground">
                    章节数 {preview.diff.chapterCount.before} → {preview.diff.chapterCount.after}（切片条数）
                    {" · "}
                    角色数 {preview.diff.characterCount.before} → {preview.diff.characterCount.after}
                  </div>
                  {preview.diff.novelFields.length > 0 ? (
                    <div className="max-h-28 space-y-1 overflow-auto">
                      {preview.diff.novelFields.map((field) => (
                        <div key={field.field} className="rounded bg-muted/40 px-2 py-1">
                          <span className="font-medium">{field.field}</span>
                          <div className="mt-0.5 text-muted-foreground">
                            当前：{field.before || "—"}
                            <br />
                            切片：{field.after || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">小说关键字段无差异</div>
                  )}
                  {preview.diff.conflictIds.length > 0 ? (
                    <div className="rounded bg-amber-50 px-2 py-1 text-amber-900">
                      冲突 ID（归属其他小说，将跳过）：{preview.diff.conflictIds.slice(0, 12).join(", ")}
                      {preview.diff.conflictIds.length > 12 ? "…" : ""}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="max-h-40 space-y-1 overflow-auto rounded-md border px-2 py-2 text-xs">
                {preview.models.map((plan) => (
                  <div key={plan.model} className="flex justify-between gap-2 border-b border-border/50 py-1 last:border-0">
                    <span className="font-medium">{plan.model}</span>
                    <span className="text-muted-foreground">
                      +{plan.create} / ~{plan.update}
                      {plan.skipConflict ? ` / !${plan.skipConflict}` : ""}
                      {plan.truncatedInSlice ? " · 截断" : ""}
                    </span>
                  </div>
                ))}
                {preview.models.length === 0 ? (
                  <div className="text-muted-foreground">切片中没有可导入的内容表</div>
                ) : null}
              </div>
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

          {result ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              已应用：新建 {result.applied.create} · 更新 {result.applied.update}
              {result.applied.novelUpdated ? " · 已更新小说字段" : ""}
              {result.applied.errors.length > 0
                ? ` · ${result.applied.errors.length} 条失败（见服务端/审计）`
                : ""}
            </div>
          ) : null}

          {error ? <p className="text-destructive">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={props.onCancel} className="rounded-md border px-3 py-1.5 text-sm">
            {result ? "关闭" : "取消"}
          </button>
          {!result ? (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void runImport()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
            >
              {submitting ? "导入中…" : "确认导入"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
