import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import {
  cancelLlmHumanRelay,
  getLlmHumanRelaySettings,
  resolveLlmHumanRelay,
} from "@/api/llmHumanRelay";
import { queryKeys } from "@/api/queryKeys";
import { useHumanRelayPending } from "@/hooks/useHumanRelayPending";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

export default function HumanRelayDialog() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.humanRelaySettings,
    queryFn: getLlmHumanRelaySettings,
    staleTime: 30_000,
  });
  const relayEnabled = Boolean(settingsQuery.data?.data?.enabled);
  const { active, queueCount } = useHumanRelayPending(relayEnabled);
  const [responseText, setResponseText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResponseText("");
    setCopied(false);
  }, [active?.id]);

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!active) {
        throw new Error("没有待处理的请求");
      }
      return resolveLlmHumanRelay(active.id, { responseText });
    },
    onSuccess: async () => {
      toast.success("已提交，系统将继续处理");
      setResponseText("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.humanRelayPending });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "提交失败");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!active) {
        throw new Error("没有待处理的请求");
      }
      return cancelLlmHumanRelay(active.id);
    },
    onSuccess: async () => {
      toast.success("已取消本次中继");
      setResponseText("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.humanRelayPending });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "取消失败");
    },
  });

  const handleCopy = async () => {
    if (!active?.promptText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(active.promptText);
      setCopied(true);
      toast.success("提示词已复制");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  };

  const open = Boolean(relayEnabled && active);

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="flex max-h-[90vh] w-[min(920px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>人工中继：等待你粘贴模型返回</DialogTitle>
          <DialogDescription>
            系统已暂停本次 API 调用。请复制下方提示词，交给外部 API，再把返回内容粘贴回来提交。
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            <Badge variant="outline">{active?.provider ?? "-"}</Badge>
            <Badge variant="outline">{active?.model ?? "-"}</Badge>
            {active?.taskType ? <Badge variant="secondary">{active.taskType}</Badge> : null}
            {active?.method ? <Badge variant="secondary">{active.method}</Badge> : null}
            {queueCount > 1 ? <span>队列中还有 {queueCount - 1} 个请求</span> : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">待发送提示词</div>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => void handleCopy()}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? "已复制" : "复制提示词"}
              </Button>
            </div>
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
              {active?.promptText || "（无提示词内容）"}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">粘贴外部 API 返回</div>
            <textarea
              className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="把外部模型返回的完整文本粘贴到这里，然后点提交。"
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={cancelMutation.isPending || resolveMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            {cancelMutation.isPending ? "取消中..." : "取消本次"}
          </Button>
          <Button
            type="button"
            disabled={!responseText.trim() || resolveMutation.isPending || cancelMutation.isPending}
            onClick={() => resolveMutation.mutate()}
          >
            {resolveMutation.isPending ? "提交中..." : "提交并继续"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
