import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, Images } from "lucide-react";
import { generateChapterImageStoryPack, type ChapterImageStoryPack } from "@/api/novel/chapters";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import { copyTextWithFallback, describeCopyResult, downloadPlainTextFile } from "@/lib/clipboard";
import {
  buildChapterImageStoryCopyText,
  chapterImageStoryCopyFilename,
} from "./chapterImageStoryCopy";

interface ChapterEditorImageStoryPackPanelProps {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle?: string | null;
  contentDraft: string;
}

function downloadJson(pack: ChapterImageStoryPack, filename: string) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ChapterEditorImageStoryPackPanel(props: ChapterEditorImageStoryPackPanelProps) {
  const { novelId, chapterId, chapterOrder, chapterTitle, contentDraft } = props;
  const llm = useLLMStore();
  const [pack, setPack] = useState<ChapterImageStoryPack | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => generateChapterImageStoryPack(novelId, chapterId, {
      content: contentDraft,
      ...(llm.provider ? { provider: llm.provider } : {}),
      ...(llm.model ? { model: llm.model } : {}),
      temperature: llm.temperature,
    }),
    onSuccess: (response) => {
      if (!response.data) {
        toast.error("没有返回可用的切图提示词。");
        return;
      }
      setPack(response.data);
      toast.success(`已按本章生成 ${response.data.shots.length} 个镜头提示词。`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "生成本章切图提示词失败。");
    },
  });

  const canGenerate = Boolean(contentDraft.trim()) && !generateMutation.isPending;

  const handleDownload = () => {
    if (!pack) {
      return;
    }
    const safeTitle = (chapterTitle?.trim() || `第${chapterOrder}章`).replace(/[\\/:*?"<>|]/g, "_");
    downloadJson(pack, `${safeTitle}-image-story-pack.json`);
    toast.success("本章切图提示词包已下载。");
  };

  const handleCopy = async () => {
    if (!pack) {
      return;
    }
    try {
      const text = buildChapterImageStoryCopyText(JSON.stringify(pack, null, 2));
      const filename = chapterImageStoryCopyFilename(chapterOrder, chapterTitle);
      const result = await copyTextWithFallback(text, { downloadFilename: filename });
      toast.success(
        result.method === "download"
          ? describeCopyResult(result)
          : "已复制本章切图文本（含豆包说明与 JSON）。",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败。");
    }
  };

  const handleDownloadText = () => {
    if (!pack) {
      return;
    }
    const text = buildChapterImageStoryCopyText(JSON.stringify(pack, null, 2));
    const filename = chapterImageStoryCopyFilename(chapterOrder, chapterTitle);
    downloadPlainTextFile(text, filename);
    toast.success(`文本已下载：${filename}`);
  };

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">按本章生成切图</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            把本章正文拆成一组竖屏镜头提示词。可下载 JSON，或复制/下载文本给豆包；不能写剪贴板时会自动下载 .txt。
          </p>
        </div>
        {pack ? <Badge variant="secondary">{pack.shots.length} 镜</Badge> : null}
      </div>

      <AiButton
        type="button"
        size="sm"
        className="w-full"
        disabled={!canGenerate}
        onClick={() => generateMutation.mutate()}
      >
        <Images className="h-4 w-4" />
        {generateMutation.isPending ? "正在拆镜头…" : "生成本章切图提示词"}
      </AiButton>

      {!contentDraft.trim() ? (
        <p className="text-xs text-muted-foreground">先写一点本章正文，再生成切图提示词。</p>
      ) : null}

      {pack ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-2.5 text-xs leading-5 text-muted-foreground">
          <div className="text-foreground">{pack.summary}</div>
          <div>默认用每镜 captionedImagePrompt（对话画进图里），按 order 顺序出图即可。</div>
          {pack.warnings.length > 0 ? (
            <div className="text-destructive">提醒：{pack.warnings.slice(0, 3).join("；")}</div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              下载 JSON
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
              <Copy className="h-3.5 w-3.5" />
              复制文本
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleDownloadText}>
              <Download className="h-3.5 w-3.5" />
              下载文本
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
