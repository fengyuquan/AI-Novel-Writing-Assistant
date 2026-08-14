/**
 * 分格脚本人工干预弹窗：复制提示词到外部模型，再粘贴 JSON 写回。
 */
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { ClipboardPaste, Copy, Loader2, Sparkles } from "lucide-react";

import type { PanelScriptPreparePreview } from "@/api/comic";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { copyTextWithFallback, describeCopyResult } from "@/lib/clipboard";

interface Props {
  open: boolean;
  preview: PanelScriptPreparePreview | null;
  loading?: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onApply: (rawText: string) => void;
}

function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function quickValidatePanelScriptJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "请先粘贴外部模型返回的 JSON。";
  // 只做最轻量检查；字段兼容交给服务端尽最大努力识别
  if (!trimmed.includes("{") && !trimmed.includes("[")) {
    return "内容里没有 JSON，请粘贴外部模型返回的脚本结果。";
  }
  if (trimmed.length < 8) return "粘贴内容过短。";
  return null;
}

export function ScriptGenerationConfirmDialog({
  open,
  preview,
  loading,
  submitting,
  onCancel,
  onApply,
}: Props) {
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  // 非受控：大段 JSON 粘贴时避免 React 受控重绘把页面卡死
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [pasteBytes, setPasteBytes] = useState(0);
  const [localValidating, setLocalValidating] = useState(false);
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    if (preview && pasteTextareaRef.current) {
      pasteTextareaRef.current.value = "";
      setPasteBytes(0);
    }
  }, [preview]);

  const focusPasteBox = (hint?: string) => {
    const el = pasteTextareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: false });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    if (hint) toast.message(hint);
  };

  const applyPastedText = (text: string) => {
    const next = text ?? "";
    if (!pasteTextareaRef.current) return false;
    pasteTextareaRef.current.value = next;
    setPasteBytes(next.length);
    if (!next.trim()) return false;
    toast.success(`已粘贴 ${next.length} 字符`);
    return true;
  };

  const pasteFromClipboard = async () => {
    // 手机端多数浏览器禁止脚本读剪贴板，优先引导在框内长按粘贴
    if (isCoarsePointerDevice()) {
      focusPasteBox("请在下方输入框内长按，选择「粘贴」");
      return;
    }

    setPasting(true);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (applyPastedText(text)) return;
        focusPasteBox("剪贴板没有文本，请在输入框内 Ctrl+V 粘贴");
        return;
      }
      focusPasteBox("请点击下方输入框后按 Ctrl+V 粘贴");
    } catch {
      focusPasteBox("无法自动读取剪贴板，请在输入框内长按或 Ctrl+V 粘贴");
    } finally {
      setPasting(false);
    }
  };

  const handleNativePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    // 让浏览器默认写入；下一帧同步字数，避免受控重绘
    window.setTimeout(() => {
      const value = pasteTextareaRef.current?.value ?? text;
      setPasteBytes(value.length);
      if (value.trim()) {
        toast.success(`已粘贴 ${value.length} 字符`);
      }
    }, 0);
  };

  const copyPrompt = async () => {
    const text = preview?.copyText ?? "";
    if (!text.trim()) {
      toast.error("提示词为空，无法复制");
      return;
    }
    try {
      const result = await copyTextWithFallback(text, {
        downloadFilename: "panel-script-prompt.txt",
        sourceElement: promptTextareaRef.current,
      });
      toast.success(describeCopyResult(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败，请手动全选提示词后复制");
    }
  };

  const handleApply = () => {
    const raw = pasteTextareaRef.current?.value ?? "";
    setLocalValidating(true);
    window.setTimeout(() => {
      try {
        const error = quickValidatePanelScriptJson(raw);
        if (error) {
          toast.error(error);
          return;
        }
        onApply(raw.trim());
      } finally {
        setLocalValidating(false);
      }
    }, 0);
  };

  const busy = submitting || localValidating;

  const footer = preview ? (
    <div className="flex w-full flex-col gap-1.5 sm:gap-2">
      <p className="hidden text-[11px] leading-relaxed text-muted-foreground sm:block">
        {busy
          ? (submitting ? "正在写入分格（通常几秒内完成）…" : "正在本地检查 JSON…")
          : "复制提示词到外部模型后，把 JSON 粘贴回下方输入框再写入"}
      </p>
      <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 min-w-14 px-2 sm:h-8 sm:min-w-20 sm:px-3" onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 min-w-20 px-2 sm:h-8 sm:min-w-28 sm:px-3"
          disabled={busy || pasteBytes === 0}
          onClick={handleApply}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {submitting ? "写入中..." : localValidating ? "检查中..." : "写入分格脚本"}
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AppDialogContent
        title="人工干预：分格脚本"
        description={preview ? `第 ${preview.episodeOrder} 话 · ${preview.episodeTitle}` : undefined}
        footer={footer}
        footerClassName="px-3 py-2 sm:px-6 sm:py-3"
        headerClassName="px-3 py-3 pr-10 sm:px-6 sm:py-4 sm:pr-12"
        bodyClassName="px-3 py-3 sm:px-6 sm:py-4"
        className="max-w-3xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在准备分格提示词...
          </div>
        ) : !preview ? (
          <div className="py-12 text-center text-sm text-muted-foreground">无预览数据</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              已开启人工分格：不调用本系统文本模型。请复制下方提示词到外部模型，再把完整 JSON 结果粘贴回来。
              目标约 {preview.targetPanelCount} 格 · 密度 {preview.densityMode} · 形态 {preview.comicFormat}。
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground">提示词</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void copyPrompt();
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </Button>
              </div>
              <textarea
                ref={promptTextareaRef}
                className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                style={{ minHeight: 120, maxHeight: 200 }}
                value={preview.copyText}
                readOnly
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {preview.copyText.length} 字符 · 复制失败时可点文本框后长按复制
              </p>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="min-w-0 text-xs font-semibold text-muted-foreground">返回的 JSON</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={submitting || pasting}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void pasteFromClipboard();
                  }}
                >
                  {pasting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardPaste className="h-3.5 w-3.5" />}
                  去粘贴
                </Button>
              </div>
              <textarea
                ref={pasteTextareaRef}
                className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                style={{ minHeight: 160, maxHeight: 280 }}
                defaultValue=""
                placeholder={"手机：点「去粘贴」后在此框长按选择粘贴\n电脑：可自动读取剪贴板，或在此 Ctrl+V"}
                disabled={submitting}
                onPaste={handleNativePaste}
                onInput={(event) => {
                  setPasteBytes(event.currentTarget.value.length);
                }}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                已粘贴 {pasteBytes} 字符。手机端请在输入框内长按粘贴；粘贴完成后点「写入分格脚本」。
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-muted-foreground">查看 JSON 格式要求</summary>
                <p className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground">{preview.schemaHint}</p>
              </details>
            </div>
          </div>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
