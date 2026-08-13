import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Layers3, RefreshCw, Sparkles } from "lucide-react";
import {
  downloadDramaExport,
  getLatestDramaPromptPackJob,
  retryFailedDramaPromptPackPipeline,
  startDramaPromptPackPipeline,
  type DramaBatchJob,
  type DramaPromptPackProgress,
  type DramaPromptPackStage,
  type DramaProjectDetail,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { copyTextWithFallback, describeCopyResult, downloadPlainTextFile } from "@/lib/clipboard";
import { getDramaLlmOptions } from "@/pages/drama/dramaLlmOptions";
import {
  buildPromptPackCopyText,
  promptPackCopyFilename,
  type DramaPromptPackCopyFormat,
} from "@/pages/drama/dramaPromptPackCopy";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parsePromptPackProgress(job: DramaBatchJob | null | undefined): DramaPromptPackProgress | null {
  if (!job || job.type !== "prompt_pack") {
    return null;
  }
  try {
    const parsed = JSON.parse(job.progress) as Partial<DramaPromptPackProgress>;
    return {
      stage: parsed.stage ?? "assemble",
      totalEpisodes: parsed.totalEpisodes ?? 0,
      doneEpisodes: parsed.doneEpisodes ?? 0,
      skippedEpisodes: parsed.skippedEpisodes ?? 0,
      failedEpisodeOrders: parsed.failedEpisodeOrders ?? [],
      currentEpisodeOrder: parsed.currentEpisodeOrder,
      errors: parsed.errors ?? [],
      mode: "slideshow",
      exportReady: Boolean(parsed.exportReady),
    };
  } catch {
    return null;
  }
}

const STAGE_LABEL: Record<DramaPromptPackStage, string> = {
  assemble: "整理素材",
  strategy: "生成策略",
  outline: "生成分集大纲",
  script: "生成台本",
  storyboard: "生成分镜",
  export: "准备导出",
  done: "已完成",
};

function statusLabel(status: DramaBatchJob["status"]): string {
  if (status === "running" || status === "pending") return "进行中";
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "paused") return "已暂停";
  return status;
}

interface DramaPromptPackPipelineCardProps {
  project: DramaProjectDetail;
}

export function DramaPromptPackPipelineCard({ project }: DramaPromptPackPipelineCardProps) {
  const queryClient = useQueryClient();
  const latestQuery = useQuery({
    queryKey: queryKeys.drama.promptPackLatest(project.id),
    queryFn: () => getLatestDramaPromptPackJob(project.id),
    refetchInterval: (query) => {
      const job = query.state.data?.data;
      if (job && (job.status === "pending" || job.status === "running")) {
        return 2500;
      }
      return false;
    },
  });

  const job = latestQuery.data?.data ?? null;
  const progress = parsePromptPackProgress(job);
  const running = job?.status === "pending" || job?.status === "running";

  useEffect(() => {
    if (!job || running) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(project.id) });
  }, [job?.id, job?.status, project.id, queryClient, running]);

  const startMutation = useMutation({
    mutationFn: () => startDramaPromptPackPipeline(project.id, getDramaLlmOptions()),
    onSuccess: async () => {
      await latestQuery.refetch();
      toast.success("已开始生成切图提示词包。");
    },
    onError: (error: Error) => {
      toast.error(error.message || "启动切图提示词包失败。");
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryFailedDramaPromptPackPipeline(project.id, getDramaLlmOptions()),
    onSuccess: async () => {
      await latestQuery.refetch();
      toast.success("已开始重试失败集。");
    },
    onError: (error: Error) => {
      toast.error(error.message || "重试失败集失败。");
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async (format: DramaPromptPackCopyFormat) => {
      const blob = await downloadDramaExport(project.id, format);
      const filename = format === "prompt-pack-captioned"
        ? `${project.title}-prompt-pack-captioned.json`
        : `${project.title}-prompt-pack.json`;
      downloadBlob(blob, filename);
      return format;
    },
    onSuccess: (format) => {
      toast.success(
        format === "prompt-pack-captioned"
          ? "对话入画提示词包已下载。"
          : "切图提示词包已下载。",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "下载提示词包失败。");
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (format: DramaPromptPackCopyFormat) => {
      const blob = await downloadDramaExport(project.id, format);
      const jsonBody = await blob.text();
      const text = buildPromptPackCopyText(format, jsonBody);
      const filename = promptPackCopyFilename(format, project.title);
      const result = await copyTextWithFallback(text, { downloadFilename: filename });
      return { format, result };
    },
    onSuccess: ({ format, result }) => {
      if (result.method === "download") {
        toast.success(describeCopyResult(result));
        return;
      }
      toast.success(
        format === "prompt-pack-captioned"
          ? "已复制对话入画文本（含豆包说明与 JSON）。"
          : "已复制切图包文本（含豆包说明与 JSON）。",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "复制提示词包失败。");
    },
  });

  const downloadTextMutation = useMutation({
    mutationFn: async (format: DramaPromptPackCopyFormat) => {
      const blob = await downloadDramaExport(project.id, format);
      const jsonBody = await blob.text();
      const text = buildPromptPackCopyText(format, jsonBody);
      const filename = promptPackCopyFilename(format, project.title);
      downloadPlainTextFile(text, filename);
      return filename;
    },
    onSuccess: (filename) => {
      toast.success(`文本已下载：${filename}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "下载文本失败。");
    },
  });

  const busy = startMutation.isPending
    || retryMutation.isPending
    || downloadMutation.isPending
    || copyMutation.isPending
    || downloadTextMutation.isPending
    || running;
  const failedOrders = progress?.failedEpisodeOrders ?? [];
  const canRetry = Boolean(job && !running && failedOrders.length > 0);
  const canDownload = Boolean(
    progress?.exportReady
    || (job?.status === "done" && (project.episodes ?? []).some((episode) => (episode.storyboards?.length ?? 0) > 0)),
  );

  return (
    <Card className="rounded-lg border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">一键生成切图提示词包</CardTitle>
          {job ? <Badge variant="secondary">{statusLabel(job.status)}</Badge> : null}
        </div>
        <CardDescription>
          自动整理素材、生成策略、分集、台本和分镜。可下载 JSON，或复制/下载文本（豆包说明 + JSON）。若环境不能写剪贴板，复制会自动改为下载 .txt。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {progress ? (
          <div className="space-y-1 rounded-md border bg-background/80 p-3 text-sm">
            <div>当前阶段：{STAGE_LABEL[progress.stage]}</div>
            <div>
              集进度：{progress.doneEpisodes}/{progress.totalEpisodes || project.targetEpisodes}
              {progress.currentEpisodeOrder ? `（正在处理第 ${progress.currentEpisodeOrder} 集）` : ""}
            </div>
            {progress.skippedEpisodes > 0 ? <div>已跳过已有内容：{progress.skippedEpisodes} 集</div> : null}
            {failedOrders.length > 0 ? (
              <div className="text-destructive">失败集：{failedOrders.join("、")}</div>
            ) : null}
            {progress.errors.slice(-3).map((error, index) => (
              <div key={`${error.stage}-${error.episodeOrder ?? "x"}-${index}`} className="text-muted-foreground">
                {error.episodeOrder ? `第 ${error.episodeOrder} 集：` : ""}
                {error.message}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            需要先选好赛道。生成完成后可下载：切图提示词包（画面+外挂台词），或对话入画包（台词写进出图提示词，按镜头顺序出图即可）。
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || !project.track}
            onClick={() => startMutation.mutate()}
          >
            <Sparkles className="h-4 w-4" />
            {running ? "生成中…" : "一键生成切图提示词包"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || busy}
            onClick={() => downloadMutation.mutate("prompt-pack")}
          >
            <Download className="h-4 w-4" />
            下载切图提示词包
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || busy}
            onClick={() => copyMutation.mutate("prompt-pack")}
          >
            <Copy className="h-4 w-4" />
            复制切图包文本
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || busy}
            onClick={() => downloadTextMutation.mutate("prompt-pack")}
          >
            <Download className="h-4 w-4" />
            下载切图包文本
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || busy}
            onClick={() => downloadMutation.mutate("prompt-pack-captioned")}
          >
            <Download className="h-4 w-4" />
            导出对话入画提示词包
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || busy}
            onClick={() => copyMutation.mutate("prompt-pack-captioned")}
          >
            <Copy className="h-4 w-4" />
            复制对话入画文本
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload || busy}
            onClick={() => downloadTextMutation.mutate("prompt-pack-captioned")}
          >
            <Download className="h-4 w-4" />
            下载对话入画文本
          </Button>
          {canRetry ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => retryMutation.mutate()}
            >
              <RefreshCw className="h-4 w-4" />
              只重试失败集
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={latestQuery.isFetching}
            onClick={() => void latestQuery.refetch()}
          >
            <Layers3 className="h-4 w-4" />
            刷新进度
          </Button>
        </div>
        {!project.track ? (
          <p className="text-sm text-muted-foreground">请先在新建项目或策略页设置赛道，再启动一键生成。</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
