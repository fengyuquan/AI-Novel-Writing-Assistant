import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getAPIKeySettings,
  getImageSelectionSetting,
  refreshProviderModelList,
  saveImageSelectionSetting,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  isImageCapableProvider,
  listImageModelsForProvider,
  resolveDefaultImageModel,
} from "@/lib/imageSelection";
import { patchApiKeyImageModels } from "@/lib/imageSelectionRefresh";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function DefaultImageProviderSettingsCard() {
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [feedback, setFeedback] = useState("");

  const apiKeysQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
  });

  const imageSelectionQuery = useQuery({
    queryKey: queryKeys.settings.imageSelection,
    queryFn: getImageSelectionSetting,
  });

  const imageProviders = useMemo(
    () => (apiKeysQuery.data?.data ?? []).filter(isImageCapableProvider),
    [apiKeysQuery.data?.data],
  );

  const saved = imageSelectionQuery.data?.data;
  const resolvedProvider =
    (selectedProvider && imageProviders.some((item) => item.provider === selectedProvider))
      ? selectedProvider
      : (saved?.provider && imageProviders.some((item) => item.provider === saved.provider))
        ? saved.provider
        : imageProviders[0]?.provider ?? "";

  const selectedMeta = imageProviders.find((item) => item.provider === resolvedProvider);
  const modelOptions = listImageModelsForProvider(selectedMeta);
  const resolvedModel = resolveDefaultImageModel(
    selectedMeta,
    selectedModel || (saved?.provider === resolvedProvider ? saved.model : undefined),
  );

  useEffect(() => {
    if (!saved) return;
    setSelectedProvider(saved.provider);
    setSelectedModel(saved.model);
  }, [saved?.provider, saved?.model]);

  const dirty = Boolean(resolvedProvider && resolvedModel)
    && (resolvedProvider !== (saved?.provider ?? "") || resolvedModel !== (saved?.model ?? ""));

  const saveMutation = useMutation({
    mutationFn: () => saveImageSelectionSetting({
      provider: resolvedProvider,
      model: resolvedModel,
    }),
    onSuccess: async (response) => {
      setFeedback(response.message ?? "默认图片模型已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.imageSelection });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "默认图片模型保存失败。");
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshProviderModelList(resolvedProvider as LLMProvider),
    onSuccess: (response) => {
      const refreshed = response.data;
      if (!refreshed) {
        setFeedback("没有收到模型列表。");
        return;
      }
      patchApiKeyImageModels(
        queryClient,
        refreshed.provider as LLMProvider,
        refreshed.imageModels ?? [],
        refreshed.currentImageModel,
      );
      const nextOptions = Array.from(new Set([
        ...(refreshed.imageModels ?? []),
        refreshed.currentImageModel ?? "",
      ].filter(Boolean)));
      const nextModel = nextOptions.includes(resolvedModel)
        ? resolvedModel
        : (refreshed.currentImageModel || nextOptions[0] || "");
      if (nextModel) {
        setSelectedModel(nextModel);
      }
      setFeedback(response.message ?? "图像模型列表已刷新。");
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "刷新图像模型列表失败。");
    },
  });

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>默认图片模型</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            和顶部文本模型一样，先选图片供应商，再选具体图像模型。可一键刷新该供应商的可用图像模型。
          </CardDescription>
        </div>
        {resolvedModel ? (
          <Badge variant="outline">当前 {resolvedModel}</Badge>
        ) : (
          <Badge variant="outline">未配置可用出图服务</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {imageProviders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有可用的图片服务。请先在上方厂商卡片里填写 API，并配置该厂商的图像模型。
          </p>
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="default-image-provider">
                图片供应商
              </label>
              <SelectControl
                id="default-image-provider"
                value={resolvedProvider}
                onChange={(event) => {
                  setFeedback("");
                  const nextProvider = event.target.value;
                  const nextMeta = imageProviders.find((item) => item.provider === nextProvider);
                  setSelectedProvider(nextProvider);
                  setSelectedModel(resolveDefaultImageModel(nextMeta));
                }}
              >
                {imageProviders.map((item) => (
                  <option key={item.provider} value={item.provider}>
                    {item.displayName ?? item.name}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium" htmlFor="default-image-model">
                  图像模型
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!resolvedProvider || refreshMutation.isPending}
                  onClick={() => {
                    setFeedback("");
                    refreshMutation.mutate();
                  }}
                >
                  {refreshMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  刷新模型
                </Button>
              </div>
              {modelOptions.length > 0 ? (
                <SelectControl
                  id="default-image-model"
                  value={resolvedModel}
                  onChange={(event) => {
                    setFeedback("");
                    setSelectedModel(event.target.value);
                  }}
                >
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </SelectControl>
              ) : (
                <Input
                  id="default-image-model"
                  value={resolvedModel}
                  placeholder="例如 gpt-image-2"
                  onChange={(event) => {
                    setFeedback("");
                    setSelectedModel(event.target.value);
                  }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">
              顶部导航里的模型选择只负责文本对话；出图请在这里单独指定供应商和模型。
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!dirty || !resolvedProvider || !resolvedModel || saveMutation.isPending || imageProviders.length === 0}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "保存中…" : "保存默认图片模型"}
          </Button>
          {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
