import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Eraser, RefreshCw, Search } from "lucide-react";
import type {
  LlmPromptLogDetail,
  LlmPromptLogListItem,
  LlmPromptLogMessagesPayload,
} from "@ai-novel/shared/types/llmPromptLog";
import {
  clearLlmPromptLogs,
  exportLlmPromptLogs,
  getLlmPromptLog,
  getLlmPromptLogSettings,
  listLlmPromptLogs,
  saveLlmPromptLogSettings,
} from "@/api/llmPromptLogs";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderMessages(messages: LlmPromptLogMessagesPayload) {
  if (typeof messages === "string") {
    return <pre className="whitespace-pre-wrap break-words text-sm">{messages}</pre>;
  }
  if (!Array.isArray(messages)) {
    return <pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(messages, null, 2)}</pre>;
  }
  if (messages.length > 0 && "payload" in (messages[0] as object)) {
    return (
      <div className="space-y-4">
        {(messages as Array<{ index: number; payload: LlmPromptLogMessagesPayload }>).map((entry) => (
          <div key={entry.index} className="rounded-md border p-3">
            <div className="mb-2 text-xs text-muted-foreground">batch #{entry.index + 1}</div>
            {renderMessages(entry.payload)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {(messages as Array<{ role: string; content: string }>).map((entry, index) => (
        <div key={`${entry.role}-${index}`} className="rounded-md border p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {entry.role || `message_${index + 1}`}
          </div>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.content}</pre>
        </div>
      ))}
    </div>
  );
}

export default function PromptLogsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<string | null>(null);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      q: q || undefined,
      provider: provider || undefined,
    }),
    [page, q, provider],
  );
  const listKey = JSON.stringify(listParams);

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.promptLogSettings,
    queryFn: getLlmPromptLogSettings,
  });
  const listQuery = useQuery({
    queryKey: queryKeys.settings.promptLogs(listKey),
    queryFn: () => listLlmPromptLogs(listParams),
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.settings.promptLogDetail(detailId ?? ""),
    queryFn: () => getLlmPromptLog(detailId!),
    enabled: Boolean(detailId),
  });

  const settings = settingsQuery.data?.data;
  const list = listQuery.data?.data;
  const detail = detailQuery.data?.data as LlmPromptLogDetail | undefined;
  const retentionValue = retentionDraft ?? String(settings?.retentionCount ?? 200);

  const saveSettingsMutation = useMutation({
    mutationFn: saveLlmPromptLogSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.promptLogSettings });
      toast.success("提示词记录设置已保存");
      setRetentionDraft(null);
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearLlmPromptLogs,
    onSuccess: async (result) => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["settings", "prompt-logs"] });
      toast.success(result.message ?? "已清空提示词记录");
    },
  });

  const items = list?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize ?? 20)));

  function toggleSelected(id: string) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleSelectPage() {
    const pageIds = items.map((item) => item.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
  }

  async function handleExport(scope: "selected" | "filtered") {
    try {
      const blob = await exportLlmPromptLogs({
        ...listParams,
        page: undefined,
        pageSize: undefined,
        ids: scope === "selected" ? selectedIds : undefined,
        format: "jsonl",
      });
      downloadBlob(blob, `llm-prompt-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jsonl`);
      toast.success("提示词记录已导出");
    } catch {
      // toast handled by api client
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings">
            <ArrowLeft className="mr-1 size-4" />
            返回设置
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">提示词调用记录</h1>
        <p className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          查看系统发给模型的提示词，便于排查生成结果。这里只保存请求内容，不保存模型回复。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>记录设置</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            开启后，每次调用模型都会保存发出去的提示词；超过保留条数时自动删除最旧记录。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <Switch
              checked={Boolean(settings?.enabled)}
              disabled={!settings || saveSettingsMutation.isPending}
              onCheckedChange={(enabled) => saveSettingsMutation.mutate({ enabled })}
            />
            <div>
              <div className="text-sm font-medium">{settings?.enabled ? "正在记录" : "已暂停记录"}</div>
              <div className="text-xs text-muted-foreground">关闭后不再新增，已有记录仍可查看与导出</div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="prompt-log-retention">保留条数</label>
              <Input
                id="prompt-log-retention"
                className="w-28"
                type="number"
                min={10}
                max={2000}
                value={retentionValue}
                onChange={(event) => setRetentionDraft(event.target.value)}
              />
            </div>
            <Button
              disabled={saveSettingsMutation.isPending}
              onClick={() => {
                const retentionCount = Number.parseInt(retentionValue, 10);
                if (!Number.isFinite(retentionCount)) {
                  toast.error("请输入有效的保留条数");
                  return;
                }
                saveSettingsMutation.mutate({ retentionCount });
              }}
            >
              保存保留条数
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>调用列表</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            可按关键字或服务商筛选，导出当前筛选结果或已勾选记录。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜索提示词资产、模型、任务或小说 id"
                value={qDraft}
                onChange={(event) => setQDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setPage(1);
                    setQ(qDraft.trim());
                  }
                }}
              />
            </div>
            <Input
              className="md:w-40"
              placeholder="服务商"
              value={provider}
              onChange={(event) => {
                setPage(1);
                setProvider(event.target.value.trim());
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                setQ(qDraft.trim());
              }}
            >
              筛选
            </Button>
            <Button
              variant="outline"
              onClick={() => listQuery.refetch()}
            >
              <RefreshCw className="mr-1 size-4" />
              刷新
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={selectedIds.length === 0}
              onClick={() => void handleExport("selected")}
            >
              <Download className="mr-1 size-4" />
              导出已选
            </Button>
            <Button variant="outline" onClick={() => void handleExport("filtered")}>
              <Download className="mr-1 size-4" />
              导出当前筛选
            </Button>
            <Button
              variant="destructive"
              disabled={clearMutation.isPending || ((list?.total ?? 0) === 0 && selectedIds.length === 0)}
              onClick={() => {
                const confirmed = window.confirm(
                  selectedIds.length > 0
                    ? `确定删除已选的 ${selectedIds.length} 条提示词记录？`
                    : "确定清空当前筛选范围内的提示词记录？",
                );
                if (!confirmed) {
                  return;
                }
                clearMutation.mutate(
                  selectedIds.length > 0
                    ? { ids: selectedIds }
                    : {
                        q: listParams.q,
                        provider: listParams.provider,
                      },
                );
              }}
            >
              <Eraser className="mr-1 size-4" />
              {selectedIds.length > 0 ? "删除已选" : "清空当前筛选"}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="全选本页"
                      checked={items.length > 0 && items.every((item) => selectedIds.includes(item.id))}
                      onChange={toggleSelectPage}
                    />
                  </th>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">服务商 / 模型</th>
                  <th className="px-3 py-2">提示词</th>
                  <th className="px-3 py-2">任务</th>
                  <th className="px-3 py-2">字数</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={6}>正在加载…</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={6}>
                      还没有提示词记录。开启记录并触发一次 AI 调用后，这里会出现内容。
                    </td>
                  </tr>
                ) : (
                  items.map((item: LlmPromptLogListItem) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-t hover:bg-muted/30"
                      onClick={() => setDetailId(item.id)}
                    >
                      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`选择 ${item.requestId}`}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatTime(item.createdAt)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.provider}</div>
                        <div className="text-xs text-muted-foreground">{item.model}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.promptAssetKey ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{item.promptVersion ?? item.method}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{item.taskType ?? "-"}</div>
                        {item.truncated ? <Badge variant="outline">已截断</Badge> : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.messageCount} 段 / {item.messageChars} 字
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <div>共 {list?.total ?? 0} 条</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <span>{page} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>提示词详情</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.provider} / ${detail.model} · ${formatTime(detail.createdAt)}`
                : "正在加载完整提示词…"}
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading || !detail ? (
            <div className="py-8 text-sm text-muted-foreground">正在加载…</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <div>提示词资产：{detail.promptAssetKey ?? "-"}</div>
                <div>版本：{detail.promptVersion ?? "-"}</div>
                <div>任务类型：{detail.taskType ?? "-"}</div>
                <div>请求 id：{detail.requestId}</div>
                <div>小说 id：{detail.novelId ?? "-"}</div>
                <div>任务 id：{detail.taskId ?? "-"}</div>
              </div>
              {renderMessages(detail.messages)}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!detailId) {
                      return;
                    }
                    try {
                      const blob = await exportLlmPromptLogs({ ids: [detailId], format: "jsonl" });
                      downloadBlob(blob, `llm-prompt-log-${detailId}.jsonl`);
                      toast.success("提示词记录已导出");
                    } catch {
                      // toast handled by api client
                    }
                  }}
                  disabled={!detailId}
                >
                  <Download className="mr-1 size-4" />
                  导出本条
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
