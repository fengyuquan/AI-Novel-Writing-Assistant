import { useEffect, useMemo, useState } from "react";
import {
  executeAdminBatch,
  previewAdminBatch,
  type BatchPreview,
} from "@/lib/api";
import { getBatchPresets, type BatchPreset } from "@/lib/batchOps";

interface BatchOpsDialogProps {
  model: string;
  /** Current list filter where (e.g. novelId + status filter). */
  baseWhere: Record<string, unknown>;
  onCancel: () => void;
  onDone: () => void;
}

export function BatchOpsDialog(props: BatchOpsDialogProps) {
  const presets = useMemo(() => getBatchPresets(props.model), [props.model]);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const preset: BatchPreset | undefined = presets.find((item) => item.id === presetId) ?? presets[0];

  const mergedWhere = useMemo(() => {
    if (!preset) return props.baseWhere;
    return {
      ...props.baseWhere,
      ...(preset.whereExtra ?? {}),
    };
  }, [preset, props.baseWhere]);

  const mergedWhereKey = JSON.stringify(mergedWhere);

  useEffect(() => {
    if (!preset) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setTypedConfirm("");
    void previewAdminBatch({
      model: props.model,
      action: preset.action,
      where: mergedWhere,
      setStatus: preset.setStatus,
    })
      .then(setPreview)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "预览失败"))
      .finally(() => setLoading(false));
    // mergedWhereKey stabilizes object identity for dependency tracking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.id, preset?.action, preset?.setStatus, mergedWhereKey, props.model]);

  const canSubmit =
    Boolean(preview && preview.cappedCount > 0) &&
    !submitting &&
    (!preview?.requireTypedConfirm || typedConfirm.trim() === preview.typedConfirmText);

  async function runBatch() {
    if (!preset || !preview || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await executeAdminBatch({
        model: props.model,
        action: preset.action,
        where: mergedWhere,
        setStatus: preset.setStatus,
        typedConfirm: preview.requireTypedConfirm ? typedConfirm.trim() : undefined,
      });
      setPreview(result);
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">受控批量操作</h2>
          <p className="text-xs text-muted-foreground">{props.model} · 先预览再执行，单次最多 200 条</p>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
            执行前请先备份数据库。批量改状态或删除不可自动回滚；本控制台不提供 migrate reset。
          </p>
          <label className="block text-xs">
            预设动作
            <select
              value={preset?.id ?? ""}
              onChange={(event) => setPresetId(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              {presets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {preset ? <p className="text-xs text-muted-foreground">{preset.description}</p> : null}
          {Object.keys(props.baseWhere).length > 0 ? (
            <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
              当前范围 where = {JSON.stringify(props.baseWhere)}
            </p>
          ) : (
            <p className="text-xs text-amber-700">未限定 novelId 时将对全库匹配条件生效，请谨慎。</p>
          )}
          {loading ? <p className="text-muted-foreground">正在预览匹配数量…</p> : null}
          {preview ? (
            <>
              <p className="text-muted-foreground">{preview.warning}</p>
              <p>
                匹配 <span className="font-semibold">{preview.matchedCount}</span> 条，本次将处理{" "}
                <span className="font-semibold">{preview.cappedCount}</span> 条
                {preview.setStatus ? ` → status=${preview.setStatus}` : ""}
              </p>
              {preview.sampleIds.length > 0 ? (
                <div className="rounded-md border bg-muted/40 px-2 py-2 font-mono text-[11px]">
                  样例 ID：{preview.sampleIds.join(", ")}
                </div>
              ) : null}
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
            onClick={() => void runBatch()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          >
            {submitting ? "执行中…" : "确认执行"}
          </button>
        </div>
      </div>
    </div>
  );
}
