import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Check, FileText, Layers, Loader2, Pencil, Sparkles, SquareStack, X } from "lucide-react";
import {
  applyManualComicPanelScript,
  generateComicOutline,
  generateComicPanelScript,
  importComicSourceBundle,
  listComicEpisodes,
  prepareComicPanelScript,
  updateComicEpisode,
  type ComicCharacter,
  type ComicEpisode,
  type ComicProject,
  type GenerateScriptPayload,
  type PanelScriptPreparePreview,
} from "@/api/comic";
import { ScriptGenerationConfirmDialog } from "@/components/comic/ScriptGenerationConfirmDialog";
import SelectControl from "@/components/common/SelectControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  isManualScriptInterventionEnabled,
  setManualScriptInterventionEnabled,
  subscribeManualScriptIntervention,
} from "@/lib/manualScriptIntervention";

type DensityMode = NonNullable<GenerateScriptPayload["densityMode"]>;

const DENSITY_OPTIONS: Array<{ value: DensityMode; label: string; desc: string }> = [
  { value: "relaxed", label: "舒展", desc: "情绪和反应更清楚" },
  { value: "balanced", label: "均衡", desc: "默认漫画节奏" },
  { value: "compact", label: "紧凑", desc: "剧情推进更密集" },
];

const DENSITY_LABELS: Record<DensityMode, string> = { relaxed: "舒展", balanced: "均衡", compact: "紧凑" };

function parsePresetFormat(raw: string | null | undefined): string {
  if (!raw) return "webtoon";
  try {
    const parsed = JSON.parse(raw) as { format?: string };
    return parsed.format ?? "webtoon";
  } catch {
    return "webtoon";
  }
}

function parseScriptConfig(raw: string | null | undefined): {
  densityMode?: DensityMode;
  targetPanelCount?: number;
  comicFormat?: string;
  generatedAt?: string;
  adaptationMode?: string;
  qualityDebt?: {
    overall?: "pass" | "warn" | "fail";
    summary?: string;
  };
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveTargetPanelCount(densityMode: DensityMode, format: string): number {
  if (format === "4koma") {
    if (densityMode === "relaxed") return 10;
    if (densityMode === "compact") return 16;
    return 12;
  }
  if (densityMode === "relaxed") return 30;
  if (densityMode === "compact") return 65;
  return 45;
}

function episodeHasPanels(ep: ComicEpisode): boolean {
  return (ep._count?.panels ?? 0) > 0;
}

function buildScriptPayload(
  densityMode: DensityMode,
  targetPanelCount: number,
  scriptPromptInstruction: string,
): GenerateScriptPayload {
  return {
    targetPanelCount,
    densityMode,
    scriptPromptInstruction: scriptPromptInstruction.trim() || undefined,
  };
}

// ─── Episode inline editor ──────────────────────────────────────────────────

function EpisodeCard({
  ep,
  isBusy,
  batchBusy,
  onGenerateScript,
}: {
  ep: ComicEpisode;
  isBusy: boolean;
  batchBusy: boolean;
  onGenerateScript: (ep: ComicEpisode) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(ep.title ?? "");
  const [draftOutline, setDraftOutline] = useState(ep.outline ?? "");
  const [draftCliffhanger, setDraftCliffhanger] = useState(ep.cliffhanger ?? "");
  const [draftPaywalled, setDraftPaywalled] = useState(ep.isPaywalled);
  const scriptConfig = parseScriptConfig(ep.scriptConfig);
  const hasPanels = episodeHasPanels(ep);

  const saveMut = useMutation({
    mutationFn: () =>
      updateComicEpisode(ep.id, {
        title: draftTitle || undefined,
        outline: draftOutline || undefined,
        cliffhanger: draftCliffhanger || undefined,
        isPaywalled: draftPaywalled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", ep.projectId] });
      setEditing(false);
      toast.success("大纲已保存");
    },
    onError: (e) => toast.error(String(e)),
  });

  const startEdit = () => {
    setDraftTitle(ep.title ?? "");
    setDraftOutline(ep.outline ?? "");
    setDraftCliffhanger(ep.cliffhanger ?? "");
    setDraftPaywalled(ep.isPaywalled);
    setEditing(true);
  };

  return (
    <Card className="rounded-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug">
            第 {ep.order} 话 {ep.title ? `《${ep.title}》` : ""}
          </CardTitle>
          <div className="flex shrink-0 gap-1">
            {ep.isPaywalled && <Badge variant="destructive" className="h-5 text-[10px]">卡点</Badge>}
            <Badge variant="outline" className="h-5 text-[10px]">{ep._count?.panels ?? 0} 格</Badge>
            {!editing && (
              <button
                type="button"
                title="编辑大纲"
                onClick={startEdit}
                className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">标题</label>
              <input
                value={draftTitle}
                maxLength={30}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
                placeholder="本话标题"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">大纲梗概</label>
              <textarea
                value={draftOutline}
                maxLength={1000}
                rows={4}
                onChange={(e) => setDraftOutline(e.target.value)}
                className="w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-relaxed"
                placeholder="本话情节概述"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">结尾悬念</label>
              <input
                value={draftCliffhanger}
                maxLength={100}
                onChange={(e) => setDraftCliffhanger(e.target.value)}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
                placeholder="本话结尾的悬念或钩子"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={draftPaywalled}
                onChange={(e) => setDraftPaywalled(e.target.checked)}
              />
              付费卡点集
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
                className="h-7 px-3 text-xs"
              >
                {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                保存
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saveMut.isPending}
                onClick={() => setEditing(false)}
                className="h-7 px-3 text-xs"
              >
                <X className="h-3 w-3" />
                取消
              </Button>
            </div>
          </div>
        ) : (
          <>
            {ep.outline && (
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{ep.outline}</p>
            )}
            {ep.cliffhanger && (
              <p className="mt-1 text-[11px] text-muted-foreground/70 italic">↳ {ep.cliffhanger}</p>
            )}
            {scriptConfig.qualityDebt && scriptConfig.qualityDebt.overall !== "pass" && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                保真提示：{scriptConfig.qualityDebt.summary ?? "部分对白与原文不完全一致，可在分格页改气泡。"}
              </p>
            )}
            {scriptConfig.densityMode && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded border bg-muted/40 px-2 py-0.5">{DENSITY_LABELS[scriptConfig.densityMode]}密度</span>
                {scriptConfig.targetPanelCount ? (
                  <span className="rounded border bg-muted/40 px-2 py-0.5">约 {scriptConfig.targetPanelCount} 格</span>
                ) : null}
              </div>
            )}
          </>
        )}
      </CardHeader>

      {!editing && (
        <CardContent className="pt-0">
          <Button
            type="button"
            size="sm"
            variant={hasPanels ? "outline" : "default"}
            className="w-full"
            disabled={isBusy || batchBusy || !ep.outline}
            onClick={() => onGenerateScript(ep)}
          >
            {isBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成脚本...
              </>
            ) : (
              <>
                <BookOpen className="h-3.5 w-3.5" />
                {hasPanels ? "重新生成分格脚本" : "生成分格脚本"}
              </>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Character readiness warning ─────────────────────────────────────────────

function CharacterReadinessWarning({ characters }: { characters: ComicCharacter[] }) {
  const withoutSheet = characters.filter((c) => {
    try {
      const sd = c.sheetData ? JSON.parse(c.sheetData) : {};
      return sd.status !== "done";
    } catch {
      return true;
    }
  });
  if (characters.length === 0 || withoutSheet.length === 0) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <span className="font-semibold">建议先完善角色设计稿</span>
        <span className="ml-1">
          {withoutSheet.map((c) => c.name).join("、")} 尚未生成三视图。
          生成分格脚本时会注入角色视觉锚点，有设计稿才能保证各格角色外貌一致。
        </span>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function EpisodeListPanel({
  projectId,
  project,
}: {
  projectId: string;
  project: ComicProject & { characters: ComicCharacter[] };
}) {
  const queryClient = useQueryClient();
  const [busyEpId, setBusyEpId] = useState("");
  const [manualScriptMode, setManualScriptMode] = useState(() => isManualScriptInterventionEnabled());
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptPreview, setScriptPreview] = useState<PanelScriptPreparePreview | null>(null);
  const [scriptPreviewLoading, setScriptPreviewLoading] = useState(false);
  const [scriptApplySubmitting, setScriptApplySubmitting] = useState(false);
  const [pendingManualEpisodeId, setPendingManualEpisodeId] = useState("");
  const [pendingManualPayload, setPendingManualPayload] = useState<GenerateScriptPayload | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [densityMode, setDensityMode] = useState<DensityMode>("balanced");
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [scriptPromptInstruction, setScriptPromptInstruction] = useState("");

  const { data: episodes = [], isLoading } = useQuery({
    queryKey: ["comic", "episodes", projectId],
    queryFn: () => listComicEpisodes(projectId),
  });

  useEffect(() => subscribeManualScriptIntervention(setManualScriptMode), []);

  const format = parsePresetFormat(project.stylePreset);
  const targetPanelCount = resolveTargetPanelCount(densityMode, format);
  const outlinedEpisodes = episodes.filter((ep) => Boolean(ep.outline?.trim()));
  const pendingScriptEpisodes = outlinedEpisodes.filter((ep) => !episodeHasPanels(ep));
  const scriptedEpisodes = outlinedEpisodes.filter((ep) => episodeHasPanels(ep));
  const batchBusy = Boolean(batchProgress);
  const nextOutlineStart = (episodes.length || 0) + 1;
  const nextOutlineEnd = nextOutlineStart + 11;

  const bundleMut = useMutation({
    mutationFn: () => importComicSourceBundle(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project", projectId] });
      toast.success("内容源已导入");
    },
  });

  const outlineMut = useMutation({
    mutationFn: ({ startOrder, count }: { startOrder?: number; count?: number }) =>
      generateComicOutline(projectId, { startOrder, count }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      toast.success("大纲生成完成");
    },
    onError: (e) => toast.error(String(e)),
  });

  const scriptMut = useMutation({
    mutationFn: ({ episodeId, payload }: { episodeId: string; payload: GenerateScriptPayload }) =>
      generateComicPanelScript(episodeId, payload),
    onMutate: ({ episodeId }) => setBusyEpId(episodeId),
    onSuccess: (ep) => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      queryClient.invalidateQueries({ queryKey: ["comic", "panels", ep?.id] });
      toast.success(`第 ${ep?.order ?? "?"} 话脚本生成完成`);
    },
    onError: (e) => toast.error(String(e)),
    onSettled: () => setBusyEpId(""),
  });

  const batchScriptMut = useMutation({
    mutationFn: async (targets: ComicEpisode[]) => {
      const payload = buildScriptPayload(densityMode, targetPanelCount, scriptPromptInstruction);
      const succeeded: number[] = [];
      const failed: Array<{ order: number; message: string }> = [];
      setBatchProgress({ current: 0, total: targets.length });
      for (let index = 0; index < targets.length; index += 1) {
        const episode = targets[index];
        setBusyEpId(episode.id);
        setBatchProgress({ current: index + 1, total: targets.length });
        try {
          await generateComicPanelScript(episode.id, payload);
          succeeded.push(episode.order);
        } catch (error) {
          failed.push({
            order: episode.order,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { succeeded, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      queryClient.invalidateQueries({ queryKey: ["comic", "panels"] });
      if (result.failed.length === 0) {
        toast.success(`已为 ${result.succeeded.length} 话生成分格脚本`);
        return;
      }
      if (result.succeeded.length === 0) {
        toast.error(`分格生成失败：${result.failed.map((item) => `第${item.order}话`).join("、")}`);
        return;
      }
      toast.error(
        `完成 ${result.succeeded.length} 话，失败 ${result.failed.length} 话（${result.failed.map((item) => `第${item.order}话`).join("、")}）`,
      );
    },
    onError: (e) => toast.error(String(e)),
    onSettled: () => {
      setBusyEpId("");
      setBatchProgress(null);
    },
  });

  const requestGenerateOutline = () => {
    if (!project.sourceBundle) return;
    if (episodes.length > 0) {
      const ok = window.confirm(
        `这会追加第 ${nextOutlineStart}-${nextOutlineEnd} 话大纲，不会改动已有话。\n\n`
        + "若你想生成分格脚本，请点「一键生成分格」或各话上的「生成分格脚本」。\n\n"
        + "确认要继续追加大纲吗？",
      );
      if (!ok) return;
    }
    outlineMut.mutate({ startOrder: nextOutlineStart, count: 12 });
  };

  const closeScriptDialog = () => {
    if (scriptApplySubmitting) return;
    setScriptDialogOpen(false);
    setScriptPreview(null);
    setScriptPreviewLoading(false);
    setPendingManualEpisodeId("");
    setPendingManualPayload(null);
    setBusyEpId("");
  };

  const startManualScriptFlow = async (episode: ComicEpisode, payload: GenerateScriptPayload) => {
    setPendingManualEpisodeId(episode.id);
    setPendingManualPayload(payload);
    setBusyEpId(episode.id);
    setScriptDialogOpen(true);
    setScriptPreview(null);
    setScriptPreviewLoading(true);
    try {
      const preview = await prepareComicPanelScript(episode.id, payload);
      setScriptPreview(preview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setScriptDialogOpen(false);
      setPendingManualEpisodeId("");
      setPendingManualPayload(null);
      setBusyEpId("");
    } finally {
      setScriptPreviewLoading(false);
    }
  };

  const applyManualScript = async (rawText: string) => {
    if (!pendingManualEpisodeId || !pendingManualPayload) return;
    setScriptApplySubmitting(true);
    try {
      const ep = await applyManualComicPanelScript(pendingManualEpisodeId, {
        ...pendingManualPayload,
        rawText,
      });
      queryClient.invalidateQueries({ queryKey: ["comic", "episodes", projectId] });
      queryClient.invalidateQueries({ queryKey: ["comic", "panels", ep?.id] });
      queryClient.invalidateQueries({ queryKey: ["comic", "scenes", projectId] });
      toast.success(`第 ${ep?.order ?? "?"} 话脚本已写入`);
      setScriptDialogOpen(false);
      setScriptPreview(null);
      setPendingManualEpisodeId("");
      setPendingManualPayload(null);
      setBusyEpId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setScriptApplySubmitting(false);
    }
  };

  const generateScript = (episode: ComicEpisode) => {
    if (episodeHasPanels(episode)) {
      const ok = window.confirm("重新生成会替换本话已有格子脚本，并影响后续批量生图。继续生成吗？");
      if (!ok) return;
    }
    const payload = buildScriptPayload(densityMode, targetPanelCount, scriptPromptInstruction);
    if (manualScriptMode) {
      void startManualScriptFlow(episode, payload);
      return;
    }
    scriptMut.mutate({
      episodeId: episode.id,
      payload,
    });
  };

  const requestBatchGenerateScripts = () => {
    if (manualScriptMode) {
      toast.message("人工分格模式下请按话操作：打开某一话，复制提示词并粘贴结果。");
      return;
    }
    if (outlinedEpisodes.length === 0) {
      toast.error("请先生成分话大纲");
      return;
    }

    let targets = pendingScriptEpisodes;
    if (targets.length === 0) {
      const ok = window.confirm(
        `当前 ${scriptedEpisodes.length} 话都已有分格脚本。\n\n`
        + "一键重新生成会替换全部已有格子，并影响后续出图。确认继续吗？",
      );
      if (!ok) return;
      targets = scriptedEpisodes;
    } else if (scriptedEpisodes.length > 0) {
      const ok = window.confirm(
        `将依次为 ${targets.length} 话生成分格脚本，可能需要几分钟。${
          scriptedEpisodes.length > 0 ? `已跳过 ${scriptedEpisodes.length} 话已有脚本。` : ""
        }\n\n确认开始吗？`,
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `将依次为 ${targets.length} 话生成分格脚本，可能需要几分钟。\n\n确认开始吗？`,
      );
      if (!ok) return;
    }
    batchScriptMut.mutate(targets);
  };

  const isActionBusy = outlineMut.isPending || scriptMut.isPending || batchBusy || bundleMut.isPending || scriptDialogOpen;

  return (
    <div className="space-y-4">
      <CharacterReadinessWarning characters={project.characters} />

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {!project.sourceBundle && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bundleMut.isPending}
                onClick={() => bundleMut.mutate()}
              >
                <Layers className="h-4 w-4" />
                {bundleMut.isPending ? "导入中..." : "导入内容源"}
              </Button>
            )}
            {episodes.length > 0 ? (
              <Button
                type="button"
                size="sm"
                disabled={isActionBusy || outlinedEpisodes.length === 0 || manualScriptMode}
                title={manualScriptMode ? "人工分格模式下请按话复制提示词并粘贴结果" : undefined}
                onClick={requestBatchGenerateScripts}
              >
                {batchBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    分格中 {batchProgress?.current}/{batchProgress?.total}
                  </>
                ) : (
                  <>
                    <SquareStack className="h-4 w-4" />
                    {pendingScriptEpisodes.length > 0
                      ? `一键生成分格（${pendingScriptEpisodes.length} 话）`
                      : "一键重新生成全部分格"}
                  </>
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={episodes.length > 0 ? "outline" : "default"}
              disabled={outlineMut.isPending || batchBusy || !project.sourceBundle}
              onClick={requestGenerateOutline}
            >
              <Sparkles className="h-4 w-4" />
              {outlineMut.isPending
                ? "生成中..."
                : episodes.length > 0
                  ? `追加第 ${nextOutlineStart}-${nextOutlineEnd} 话大纲`
                  : `生成第 ${nextOutlineStart}-${nextOutlineEnd} 话大纲`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={batchBusy}
              onClick={() => setShowPromptSettings((v) => !v)}
            >
              <FileText className="h-4 w-4" />
              分格生成要求
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs text-muted-foreground"
              title="自动：本系统文本模型生成；人工：复制提示词到外部模型，再粘贴 JSON 写回"
            >
              分格方式
            </span>
            <SelectControl
              className="rounded-md border bg-background px-2.5 py-1 text-xs"
              value={manualScriptMode ? "manual" : "auto"}
              disabled={batchBusy || scriptDialogOpen}
              onChange={(event) => {
                const enabled = event.target.value === "manual";
                setManualScriptMode(enabled);
                setManualScriptInterventionEnabled(enabled);
                toast.message(
                  enabled
                    ? "已切换为人工分格：点「生成分格脚本」后复制提示词，再粘贴外部结果"
                    : "已切换为自动分格：点「生成分格脚本」直接调用顶部文本模型",
                );
              }}
            >
              <option value="auto">自动</option>
              <option value="manual">人工</option>
            </SelectControl>
            <span className="text-xs text-muted-foreground">信息密度</span>
            <div className="flex rounded-md border bg-background p-0.5">
              {DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    densityMode === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                  onClick={() => setDensityMode(option.value)}
                  title={option.desc}
                  disabled={batchBusy}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">约 {targetPanelCount} 格</span>
          </div>
        </div>

        {showPromptSettings && (
          <div className="mt-3 space-y-2">
            <textarea
              value={scriptPromptInstruction}
              maxLength={1000}
              onChange={(event) => setScriptPromptInstruction(event.target.value)}
              placeholder="可补充本次分格重点，例如：多给主角冷静反应特写，避免每格都塞满背景，结尾强化悬念。"
              className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs leading-relaxed"
              disabled={batchBusy}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>这些要求只影响本次分格生成，不会覆盖角色锚点、画风和结构化输出规则。</span>
              <span>{scriptPromptInstruction.length}/1000</span>
            </div>
          </div>
        )}

        {batchBusy ? (
          <p className="mt-3 text-xs text-muted-foreground">
            正在依次生成分格脚本（第 {batchProgress?.current}/{batchProgress?.total} 话），请稍候，不要关闭页面。
          </p>
        ) : null}
      </div>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>}

      {!isLoading && episodes.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          尚无分话大纲，点击上方「生成大纲」开始。
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {episodes.map((ep) => (
          <EpisodeCard
            key={ep.id}
            ep={ep}
            isBusy={busyEpId === ep.id}
            batchBusy={batchBusy || scriptDialogOpen}
            onGenerateScript={generateScript}
          />
        ))}
      </div>

      <ScriptGenerationConfirmDialog
        open={scriptDialogOpen}
        preview={scriptPreview}
        loading={scriptPreviewLoading}
        submitting={scriptApplySubmitting}
        onCancel={closeScriptDialog}
        onApply={(rawText) => { void applyManualScript(rawText); }}
      />
    </div>
  );
}
