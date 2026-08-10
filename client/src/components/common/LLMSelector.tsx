import { useCallback, useEffect, useMemo, useState } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  type APIKeyStatus,
  getAPIKeySettings,
  refreshProviderModelList,
  saveLLMSelectionSetting,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getProviderSelectionModels,
  isRunnableProviderConfig,
  resolveModel,
} from "@/lib/llmSelection";
import { writeProviderModelsCache } from "@/lib/providerModelsCache";
import { useLLMStore } from "@/store/llmStore";
import SearchableSelect from "./SearchableSelect";

const NO_PROVIDER_VALUE = "__no_runnable_provider__";

export interface LLMSelectorValue {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMSelectorProps {
  value?: LLMSelectorValue;
  onChange?: (value: LLMSelectorValue) => void;
  showModel?: boolean;
  showParameters?: boolean;
  showCompactTemperature?: boolean;
  compact?: boolean;
  /** Full-width provider/model controls for mobile top bars. */
  mobile?: boolean;
  showBadge?: boolean;
  showHelperText?: boolean;
  /** Show refresh control; uses cached models until clicked. Default true. */
  showRefreshModels?: boolean;
  className?: string;
}

function clampTemperature(value: number): number {
  return Math.min(2, Math.max(0, value));
}

function clampMaxTokens(value: number): number {
  return Math.min(32768, Math.max(256, Math.floor(value)));
}

export default function LLMSelector({
  value,
  onChange,
  showModel = true,
  showParameters = false,
  showCompactTemperature = false,
  compact = false,
  mobile = false,
  showBadge = true,
  showHelperText = true,
  showRefreshModels = true,
  className,
}: LLMSelectorProps) {
  const store = useLLMStore();
  const queryClient = useQueryClient();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [modelsCacheEpoch, setModelsCacheEpoch] = useState(0);
  const currentValue = value ?? {
    provider: store.provider,
    model: store.model,
    temperature: store.temperature,
    maxTokens: store.maxTokens,
  };

  const resolvedTemperature = currentValue.temperature ?? store.temperature;
  const resolvedMaxTokens = currentValue.maxTokens ?? store.maxTokens;

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    staleTime: 5 * 60 * 1000,
  });

  const saveSelectionMutation = useMutation({
    mutationFn: saveLLMSelectionSetting,
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.settings.llmSelection, response);
    },
  });

  const patchProviderModels = useCallback((
    provider: LLMProvider,
    models: string[],
    currentModel: string,
    baseURL?: string,
  ) => {
    writeProviderModelsCache(provider, models, baseURL);
    setModelsCacheEpoch((current) => current + 1);
    queryClient.setQueryData<ApiResponse<APIKeyStatus[]>>(
      queryKeys.settings.apiKeys,
      (previous) => {
        if (!previous?.data) {
          return previous;
        }
        return {
          ...previous,
          data: previous.data.map((item) => {
            if (item.provider !== provider) {
              return item;
            }
            return {
              ...item,
              currentModel: currentModel || item.currentModel,
              models: Array.from(new Set([
                currentModel,
                ...models,
              ].filter(Boolean))),
            };
          }),
        };
      },
    );
  }, [queryClient]);

  const refreshProviderModelsMutation = useMutation({
    mutationFn: refreshProviderModelList,
    onSuccess: (response) => {
      const refreshed = response.data;
      if (!refreshed) {
        return;
      }
      setRefreshError(null);
      const matched = (apiKeySettingsQuery.data?.data ?? []).find(
        (item) => item.provider === refreshed.provider,
      );
      patchProviderModels(
        refreshed.provider,
        refreshed.models,
        refreshed.currentModel,
        matched?.currentBaseURL,
      );
    },
    onError: (error) => {
      setRefreshError(error instanceof Error ? error.message : "刷新模型列表失败");
    },
  });

  const providerConfigs = useMemo(
    () => (apiKeySettingsQuery.data?.data ?? []).filter(isRunnableProviderConfig),
    [apiKeySettingsQuery.data?.data],
  );

  // modelsCacheEpoch forces re-read of localStorage after explicit refresh.
  const providerModelsMap = useMemo(() => {
    void modelsCacheEpoch;
    const entries = providerConfigs.map((config) => (
      [config.provider, getProviderSelectionModels(config)] as const
    ));
    return Object.fromEntries(entries) as Record<string, string[]>;
  }, [modelsCacheEpoch, providerConfigs]);

  const providerOptions = useMemo(
    () => providerConfigs.map((item) => item.provider),
    [providerConfigs],
  );

  const providerNameMap = useMemo(
    () => new Map(providerConfigs.map((item) => [item.provider, item.displayName ?? item.name])),
    [providerConfigs],
  );

  const hasRunnableProviders = providerOptions.length > 0;

  const effectiveProvider = useMemo(() => {
    if (providerOptions.includes(currentValue.provider)) {
      return currentValue.provider;
    }
    return providerOptions[0] ?? currentValue.provider;
  }, [currentValue.provider, providerOptions]);

  const models = useMemo(() => {
    const providerModels = providerModelsMap[effectiveProvider] ?? [];
    const currentModel = currentValue.model.trim();
    if (!currentModel || providerModels.includes(currentModel)) {
      return providerModels;
    }
    return [currentModel, ...providerModels];
  }, [currentValue.model, effectiveProvider, providerModelsMap]);

  const resolvedModel = useMemo(
    () => resolveModel(currentValue.model, models),
    [currentValue.model, models],
  );
  const providerSelectValue = hasRunnableProviders ? effectiveProvider : NO_PROVIDER_VALUE;
  const shouldWaitForGlobalHydration = !value && !onChange && !store.hasHydratedSelection;
  const isRefreshingModels = refreshProviderModelsMutation.isPending;

  const updateValue = useCallback((next: LLMSelectorValue) => {
    const normalizedModel = resolveModel(next.model, providerModelsMap[next.provider] ?? []);
    const normalizedTemperature = next.temperature !== undefined
      ? clampTemperature(next.temperature)
      : undefined;
    const normalizedMaxTokens = next.maxTokens !== undefined
      ? clampMaxTokens(next.maxTokens)
      : undefined;
    const normalizedNext: LLMSelectorValue = {
      ...next,
      model: normalizedModel,
      temperature: normalizedTemperature,
      maxTokens: normalizedMaxTokens,
    };
    if (onChange) {
      onChange(normalizedNext);
      return;
    }
    store.setSelection({
      provider: normalizedNext.provider,
      model: normalizedNext.model,
      temperature: normalizedNext.temperature,
      maxTokens: normalizedNext.maxTokens,
    });
    saveSelectionMutation.mutate({
      provider: normalizedNext.provider,
      model: normalizedNext.model,
      temperature: normalizedNext.temperature ?? store.temperature,
      ...(normalizedNext.maxTokens !== undefined ? { maxTokens: normalizedNext.maxTokens } : {}),
    });
  }, [onChange, providerModelsMap, saveSelectionMutation, store]);

  useEffect(() => {
    if (shouldWaitForGlobalHydration) {
      return;
    }
    if (!hasRunnableProviders) {
      return;
    }
    if (effectiveProvider === currentValue.provider && resolvedModel === currentValue.model) {
      return;
    }
    updateValue({
      provider: effectiveProvider,
      model: resolvedModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  }, [
    currentValue.model,
    currentValue.provider,
    effectiveProvider,
    hasRunnableProviders,
    resolvedMaxTokens,
    resolvedModel,
    resolvedTemperature,
    shouldWaitForGlobalHydration,
    updateValue,
  ]);

  const onProviderChange = (provider: string) => {
    if (provider === NO_PROVIDER_VALUE) {
      return;
    }
    const typedProvider = provider as LLMProvider;
    const nextModel = resolveModel("", providerModelsMap[typedProvider] ?? []);
    setRefreshError(null);
    updateValue({
      provider: typedProvider,
      model: nextModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  };

  const onModelChange = (model: string) => {
    updateValue({
      provider: effectiveProvider,
      model,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  };

  const onRefreshModels = () => {
    if (!hasRunnableProviders) {
      return;
    }
    setRefreshError(null);
    refreshProviderModelsMutation.mutate(effectiveProvider, {
      onSuccess: (response) => {
        const refreshed = response.data;
        if (!refreshed || currentValue.provider !== refreshed.provider) {
          return;
        }
        if (refreshed.models.includes(currentValue.model)) {
          return;
        }
        updateValue({
          provider: refreshed.provider,
          model: resolveModel(refreshed.currentModel, refreshed.models),
          temperature: resolvedTemperature,
          maxTokens: resolvedMaxTokens,
        });
      },
    });
  };

  const providerTriggerClass = mobile
    ? "h-9 w-full min-w-0"
    : compact
      ? "h-9 w-[148px] lg:w-[164px]"
      : "w-full sm:w-[180px]";
  const modelClass = mobile
    ? "min-w-0 flex-1"
    : compact
      ? "w-[184px] lg:w-[220px]"
      : "w-full sm:w-[240px]";

  return (
    <div className={cn("space-y-2", compact && "space-y-1", className)}>
      <div
        className={cn(
          "flex min-w-0 items-center gap-2",
          mobile ? "flex-nowrap gap-1.5" : compact ? "flex-nowrap gap-1.5" : "flex-wrap",
        )}
      >
        {showBadge ? <Badge variant="secondary">模型</Badge> : null}
        <Select
          value={providerSelectValue}
          onValueChange={onProviderChange}
          disabled={!hasRunnableProviders}
        >
          <SelectTrigger className={cn(providerTriggerClass, mobile && "max-w-[38%]")}>
            <SelectValue placeholder={hasRunnableProviders ? "选择厂商" : "请先配置可用厂商"} />
          </SelectTrigger>
          <SelectContent>
            {!hasRunnableProviders ? (
              <SelectItem value={NO_PROVIDER_VALUE} disabled>
                请先配置可用厂商
              </SelectItem>
            ) : null}
            {providerOptions.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {providerNameMap.get(provider) ?? provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showModel ? (
          <SearchableSelect
            value={resolvedModel}
            onValueChange={onModelChange}
            options={models.map((model) => ({ value: model }))}
            placeholder={hasRunnableProviders ? "选择模型" : "暂无可用模型"}
            searchPlaceholder="搜索模型"
            emptyText="没有可用模型"
            className={modelClass}
            triggerClassName={compact || mobile ? "h-9 px-2.5" : undefined}
            disabled={!hasRunnableProviders}
          />
        ) : null}

        {showRefreshModels ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("shrink-0", compact || mobile ? "h-9 w-9" : "h-10 w-10")}
            onClick={onRefreshModels}
            disabled={!hasRunnableProviders || isRefreshingModels}
            title="刷新当前厂商可用模型"
            aria-label="刷新当前厂商可用模型"
          >
            {isRefreshingModels ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        ) : null}

        {showCompactTemperature ? (
          <label
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm"
            title="温度越高越发散；结构规划建议使用 0.3～0.7"
          >
            <span>温度</span>
            <Input
              aria-label="模型温度"
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={resolvedTemperature}
              className="h-7 w-14 border-0 bg-transparent px-1 text-center text-xs text-foreground shadow-none focus-visible:ring-1"
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: parsed,
                  maxTokens: resolvedMaxTokens,
                });
              }}
              onBlur={() => {
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: clampTemperature(resolvedTemperature),
                  maxTokens: resolvedMaxTokens,
                });
              }}
              disabled={!hasRunnableProviders}
            />
          </label>
        ) : null}
      </div>

      {refreshError ? (
        <div className="text-xs text-destructive">{refreshError}</div>
      ) : null}

      {showHelperText && !hasRunnableProviders && !apiKeySettingsQuery.isLoading ? (
        <div className="text-xs text-muted-foreground">
          当前没有已配置且启用的模型厂商，请先到系统设置里完成 API Key 和模型配置。
        </div>
      ) : null}

      {showParameters ? (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">温度 (0~2)</span>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={resolvedTemperature}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: parsed,
                  maxTokens: resolvedMaxTokens,
                });
              }}
              onBlur={() => {
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: clampTemperature(resolvedTemperature),
                  maxTokens: resolvedMaxTokens,
                });
              }}
              disabled={!hasRunnableProviders}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">最大 Tokens (留空 = 不限制)</span>
            <Input
              type="number"
              step="1"
              min={256}
              max={32768}
              value={resolvedMaxTokens ?? ""}
              disabled={!hasRunnableProviders}
              onChange={(event) => {
                if (!event.target.value.trim()) {
                  updateValue({
                    provider: effectiveProvider,
                    model: resolvedModel,
                    temperature: resolvedTemperature,
                    maxTokens: undefined,
                  });
                  return;
                }
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: resolvedTemperature,
                  maxTokens: parsed,
                });
              }}
              onBlur={() => {
                if (resolvedMaxTokens === undefined) {
                  updateValue({
                    provider: effectiveProvider,
                    model: resolvedModel,
                    temperature: resolvedTemperature,
                    maxTokens: undefined,
                  });
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: resolvedTemperature,
                  maxTokens: clampMaxTokens(resolvedMaxTokens),
                });
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
