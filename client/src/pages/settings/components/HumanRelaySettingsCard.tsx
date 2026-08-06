import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLlmHumanRelaySettings, saveLlmHumanRelaySettings } from "@/api/llmHumanRelay";
import { queryKeys } from "@/api/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function HumanRelaySettingsCard() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.humanRelaySettings,
    queryFn: getLlmHumanRelaySettings,
  });
  const enabled = Boolean(settingsQuery.data?.data?.enabled);

  const saveMutation = useMutation({
    mutationFn: (nextEnabled: boolean) => saveLlmHumanRelaySettings({ enabled: nextEnabled }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.humanRelaySettings });
      toast.success(response.data?.enabled ? "人工中继已开启" : "人工中继已关闭");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败");
    },
  });

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>人工中继</CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          开启后，系统调用模型前会先弹出窗口。你可以复制提示词交给外部 API，再把返回内容粘贴回来，系统会按这个结果继续。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className={`min-w-0 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          适合在本地没有可用模型密钥、或需要用外部网页版模型时手动接力。自动导演长任务会频繁弹窗，请谨慎开启。
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">{enabled ? "已开启" : "已关闭"}</span>
          <Switch
            checked={enabled}
            disabled={settingsQuery.isLoading || saveMutation.isPending}
            onCheckedChange={(checked) => saveMutation.mutate(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
