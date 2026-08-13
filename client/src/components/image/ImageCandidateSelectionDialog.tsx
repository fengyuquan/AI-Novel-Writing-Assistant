/**
 * 多图候选选择弹窗：上游一次返回多张图时，让用户挑一张再落盘。
 * 支持放大预览、改选时回显当前已选。
 */
import { useEffect, useState } from "react";
import { Check, Loader2, ZoomIn, X } from "lucide-react";

import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveImageAssetUrl } from "@/api/images";
import type { ImageCandidateItem } from "@/api/imageRuntime";

interface Props {
  open: boolean;
  candidates: ImageCandidateItem[];
  /** 改选时回显当前成品对应的候选序号 */
  initialSelectedIndex?: number | null;
  mode?: "select" | "reselect";
  submitting?: boolean;
  onCancel: () => void;
  onSelect: (index: number) => void;
}

export function ImageCandidateSelectionDialog({
  open,
  candidates,
  initialSelectedIndex = null,
  mode = "select",
  submitting = false,
  onCancel,
  onSelect,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setPreviewIndex(null);
      return;
    }
    setSelectedIndex(
      typeof initialSelectedIndex === "number" ? initialSelectedIndex : null,
    );
    setPreviewIndex(null);
  }, [open, candidates, initialSelectedIndex]);

  const previewCandidate = previewIndex == null
    ? null
    : candidates.find((item) => item.index === previewIndex) ?? null;

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="text-[11px] text-muted-foreground">
        {mode === "reselect"
          ? `可改选已缓存的 ${candidates.length} 张结果，点放大镜可看大图`
          : `模型一次生成了 ${candidates.length} 张图，请选一张；点放大镜可看大图`}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={submitting}>
          {mode === "reselect" ? "关闭" : "取消"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || selectedIndex == null}
          onClick={() => {
            if (selectedIndex == null) return;
            onSelect(selectedIndex);
          }}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {submitting ? "保存中..." : mode === "reselect" ? "改用这张" : "使用这张"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onCancel();
        }}
      >
        <AppDialogContent
          title={mode === "reselect" ? "改选生成结果" : "选择生成结果"}
          description={mode === "reselect" ? "从本次缓存的候选图里换一张作为成品" : "点选一张图后确认，系统会把它保存为当前成品"}
          footer={footer}
          className="max-w-4xl"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {candidates.map((item) => {
              const active = selectedIndex === item.index;
              return (
                <div
                  key={`${item.index}-${item.url}`}
                  className={[
                    "group relative overflow-hidden rounded-md border bg-muted/20 text-left transition-colors",
                    active
                      ? "border-primary ring-2 ring-primary/30"
                      : "hover:border-primary/60",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setSelectedIndex(item.index)}
                    className="block w-full text-left"
                  >
                    <img
                      src={resolveImageAssetUrl(item.url)}
                      alt={`候选图 ${item.index + 1}`}
                      className="aspect-square w-full object-contain bg-background"
                      loading="lazy"
                    />
                  </button>
                  <div className="flex items-center justify-between border-t px-2 py-1.5">
                    <span className="text-[11px] text-muted-foreground">候选 {item.index + 1}</span>
                    <div className="flex items-center gap-1">
                      {active ? (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          <Check className="h-3 w-3" />
                          已选
                        </span>
                      ) : null}
                      <button
                        type="button"
                        title="放大预览"
                        disabled={submitting}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border bg-background text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewIndex(item.index);
                        }}
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AppDialogContent>
      </Dialog>

      <Dialog
        open={previewIndex != null}
        onOpenChange={(next) => {
          if (!next) setPreviewIndex(null);
        }}
      >
        <AppDialogContent
          title={previewCandidate ? `候选 ${previewCandidate.index + 1} 预览` : "预览"}
          description="点击下方按钮可选中这张，或关闭后继续比较"
          className="max-w-5xl"
          footer={(
            <div className="flex w-full justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPreviewIndex(null)}>
                <X className="h-3.5 w-3.5" />
                关闭预览
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={submitting || !previewCandidate}
                onClick={() => {
                  if (!previewCandidate) return;
                  setSelectedIndex(previewCandidate.index);
                  setPreviewIndex(null);
                }}
              >
                <Check className="h-3.5 w-3.5" />
                选中这张
              </Button>
            </div>
          )}
        >
          {previewCandidate ? (
            <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-md border bg-muted/20 p-2">
              <img
                src={resolveImageAssetUrl(previewCandidate.url)}
                alt={`候选图 ${previewCandidate.index + 1} 大图`}
                className="max-h-[68vh] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </>
  );
}
