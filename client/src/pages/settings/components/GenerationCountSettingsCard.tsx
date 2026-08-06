import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GenerationCountFieldKey,
  GenerationCountGroup,
  GenerationCountSettings,
} from "@ai-novel/shared/types/generationCounts";
import { buildDefaultGenerationCountSettings } from "@ai-novel/shared/types/generationCounts";
import { getGenerationCountSettings, saveGenerationCountSettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

const GROUP_ORDER: GenerationCountGroup[] = [
  "opening",
  "planning",
  "characterWorld",
  "coverComic",
  "bookAnalysis",
];

export default function GenerationCountSettingsCard() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.generationCounts,
    queryFn: getGenerationCountSettings,
  });
  const [draft, setDraft] = useState<GenerationCountSettings>(buildDefaultGenerationCountSettings());

  useEffect(() => {
    if (settingsQuery.data?.data?.settings) {
      setDraft(settingsQuery.data.data.settings);
    }
  }, [settingsQuery.data?.data?.settings]);

  const fields = settingsQuery.data?.data?.fields ?? [];
  const groups = useMemo(() => {
    return GROUP_ORDER
      .map((group) => {
        const items = fields.filter((field) => field.group === group);
        if (items.length === 0) {
          return null;
        }
        return {
          group,
          label: items[0]?.groupLabel ?? group,
          items,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [fields]);

  const saveMutation = useMutation({
    mutationFn: () => saveGenerationCountSettings(draft),
    onSuccess: async (response) => {
      if (response.data?.settings) {
        setDraft(response.data.settings);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.generationCounts });
      toast.success(response.message ?? "生成数量设置已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存失败");
    },
  });

  const updateField = (key: GenerationCountFieldKey, raw: string) => {
    const numeric = Number(raw);
    setDraft((current) => ({
      ...current,
      [key]: Number.isFinite(numeric) ? Math.floor(numeric) : current[key],
    }));
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>生成数量</CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          调整系统一次默认给出多少条灵感、书名、角色候选等内容。改完后对新的生成生效，已有结果不会自动重算。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {settingsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">正在加载生成数量设置…</div>
        ) : (
          groups.map((group) => (
            <div key={group.group} className="space-y-3">
              <div className="text-sm font-medium">{group.label}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.items.map((field) => (
                  <label key={field.key} className="space-y-1.5 rounded-md border p-3">
                    <div className="text-sm font-medium">{field.label}</div>
                    <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                      {field.description}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={field.min}
                        max={field.max}
                        value={draft[field.key]}
                        onChange={(event) => updateField(field.key, event.target.value)}
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {field.min}-{field.max}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={settingsQuery.isLoading || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "保存中…" : "保存生成数量"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
