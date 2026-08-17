import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import {
  importComicProjectBackup,
  previewComicProjectBackup,
  type ComicProjectTransferPreview,
} from "@/api/comic";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportComicProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState<string | null>(null);
  const [pkg, setPkg] = useState<unknown>(null);
  const [preview, setPreview] = useState<ComicProjectTransferPreview | null>(null);
  const [titleOverride, setTitleOverride] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const reset = () => {
    setFileName(null);
    setPkg(null);
    setPreview(null);
    setTitleOverride("");
    setParseError(null);
    setParsing(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function onFileChange(file: File | null) {
    setParseError(null);
    setPreview(null);
    setPkg(null);
    setFileName(null);
    setTitleOverride("");
    if (!file) return;
    setParsing(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      setPkg(parsed);
      setFileName(file.name);
      const next = await previewComicProjectBackup(parsed);
      setPreview(next);
      setTitleOverride(next.title);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "无法解析该备份文件");
    } finally {
      setParsing(false);
    }
  }

  const importMut = useMutation({
    mutationFn: () =>
      importComicProjectBackup({
        package: pkg,
        titleOverride: titleOverride.trim() || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["comic", "projects"] });
      toast.success(
        `已导入「${result.title}」` +
          (result.restoredFiles > 0 ? `，恢复 ${result.restoredFiles} 个图片文件` : ""),
      );
      handleClose(false);
      navigate(`/comic/projects/${result.projectId}`);
    },
    onError: (err) => toast.error(String(err)),
  });

  const canImport =
    Boolean(pkg && preview?.canImport) && !importMut.isPending && !parsing && titleOverride.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <AppDialogContent
        title="导入漫画项目备份"
        description="从备份文件恢复为新项目，不会覆盖现有项目。"
        className="max-w-lg"
        bodyClassName="space-y-3"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!canImport}
              onClick={() => importMut.mutate()}
            >
              <Upload className="h-4 w-4" />
              {importMut.isPending ? "导入中…" : "导入为新项目"}
            </Button>
          </>
        }
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium">选择备份文件</span>
          <input
            type="file"
            accept="application/json,.json,.comic.json"
            className="block w-full text-sm"
            onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
        {fileName ? <p className="text-xs text-muted-foreground">已选：{fileName}</p> : null}
        {parsing ? <p className="text-sm text-muted-foreground">正在检查备份内容…</p> : null}
        {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}

        {preview ? (
          <div className="space-y-3 rounded-md border bg-muted/30 px-3 py-3 text-sm">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="comic-import-title">
                新项目名称
              </label>
              <Input
                id="comic-import-title"
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                maxLength={120}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {preview.counts.episodes} 话 · {preview.counts.panels} 格 ·{" "}
              {preview.counts.characters} 角色 · {preview.counts.scenes} 场景 ·{" "}
              {preview.counts.files} 张图片
              {preview.exportedAt ? ` · 导出于 ${preview.exportedAt.slice(0, 19).replace("T", " ")}` : ""}
            </p>
            {!preview.includeImages || preview.counts.files === 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                此备份不含图片，导入后脚本与设定会保留，画面需重新生成。
              </p>
            ) : null}
            {preview.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {preview.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            {!preview.canImport ? (
              <p className="text-sm text-destructive">此备份无法导入，请查看上方说明。</p>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          支持体积约 {formatBytes(80 * 1024 * 1024)} 内的含图备份；过大图片会在导出时自动跳过。
        </p>
      </AppDialogContent>
    </Dialog>
  );
}
