/**
 * 生图前统一确认弹窗
 *
 * 用于所有生图入口（角色三视图/表情稿/资产/场景设定图/格子图/Drama 角色/Drama 关键帧）
 * 在真正消耗 token 前展示：即将发送的 prompt + 参考图素材 + 模型/尺寸；
 * 用户可临时修改 prompt / provider / size，确认后才发起生图。
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPaste, Copy, Image as ImageIcon, Info, Loader2, Sparkles, Upload, Wand2, X } from "lucide-react";

import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAPIKeySettings, getImageSelectionSetting } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import {
  isImageCapableProvider,
  listImageModelsForProvider,
  resolveDefaultImageModel,
  resolvePreferredImageSelection,
} from "@/lib/imageSelection";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "@/api/comic";
import { assistImageGenerationPrompt, resolveImageAssetUrl, type ImagePromptAssistResult } from "@/api/images";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";
import { copyTextWithFallback, describeCopyResult } from "@/lib/clipboard";
import {
  extractImageFileFromClipboardEvent,
  readClipboardImageFile,
} from "@/lib/clipboardImage";
import {
  applyComicTextToImageTaskLead,
  resolveComicImageTaskKind,
} from "@/lib/comicImageTaskPrompt";

const SIZE_OPTIONS = [
  { value: "1024x1024", label: "1024×1024（方形 1:1）" },
  { value: "1024x1536", label: "1024×1536（竖版 2:3，漫画/角色）" },
  { value: "1536x1024", label: "1536×1024（横版 3:2，三视图/表情稿）" },
];

const COUNT_OPTIONS = [
  { value: 1, label: "1 张" },
  { value: 2, label: "2 张（生成后选一张）" },
  { value: 3, label: "3 张（生成后选一张）" },
  { value: 4, label: "4 张（生成后选一张）" },
];

const REF_KIND_LABEL: Record<string, string> = {
  character_sheet: "三视图",
  character_expression: "表情稿",
  character_face: "面部裁剪",
  book_analysis_character_base: "基础形象",
  asset: "资产",
  scene: "场景",
};

const REF_KIND_COLOR: Record<string, string> = {
  character_sheet: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  character_expression: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  character_face: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  book_analysis_character_base: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  asset: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  scene: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
};

type PromptAssistAction = "explain" | "optimize";

interface Props {
  open: boolean;
  preview: ImageGenerationPreview | null;
  loading?: boolean;          // prepare 中
  submitting?: boolean;       // generate / upload 中
  manualMode?: boolean;       // 顶部勾选「人工干预生成图片」
  supportsManualUpload?: boolean;
  onCancel: () => void;
  onConfirm: (overrides: ImageGenerationOverrides) => void;
  onManualUpload?: (file: File) => void;
}

export function ImageGenerationConfirmDialog({
  open,
  preview,
  loading,
  submitting,
  manualMode = false,
  supportsManualUpload = false,
  onCancel,
  onConfirm,
  onManualUpload,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [optimizationInstruction, setOptimizationInstruction] = useState("");
  const [includedReferenceImageUrls, setIncludedReferenceImageUrls] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [count, setCount] = useState(1);
  const [promptAssistAction, setPromptAssistAction] = useState<PromptAssistAction | null>(null);
  const [promptAssistLoading, setPromptAssistLoading] = useState<PromptAssistAction | null>(null);
  const [promptAssistResult, setPromptAssistResult] = useState<ImagePromptAssistResult | null>(null);
  const [promptAssistError, setPromptAssistError] = useState("");

  // 弹窗重新打开或 preview 变更时，重置编辑态；供应商/模型优先跟顶部默认图片选择
  useEffect(() => {
    if (!preview) return;
    const included = preview.referenceImages.map((ref) => ref.url);
    const taskKind = resolveComicImageTaskKind(preview.kind);
    setPrompt(applyComicTextToImageTaskLead(preview.prompt, taskKind, included.length > 0));
    setNegativePrompt(preview.negativePrompt ?? "");
    setOptimizationInstruction("");
    setIncludedReferenceImageUrls(included);
    setSize(preview.size);
    setCount(1);
    setPromptAssistAction(null);
    setPromptAssistLoading(null);
    setPromptAssistResult(null);
    setPromptAssistError("");
  }, [preview]);

  const { data: imageProviders = [] } = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    select: (res) => (res.data ?? []).filter(isImageCapableProvider),
  });

  const { data: imageSelection } = useQuery({
    queryKey: queryKeys.settings.imageSelection,
    queryFn: getImageSelectionSetting,
    select: (res) => res.data,
  });

  useEffect(() => {
    if (!open || !preview) return;
    const preferred = resolvePreferredImageSelection(imageSelection, imageProviders);
    const nextProvider = preferred?.provider ?? preview.provider;
    const providerMeta = imageProviders.find((item) => item.provider === nextProvider);
    const nextModel = resolveDefaultImageModel(
      providerMeta,
      preferred?.provider === nextProvider
        ? preferred.model
        : (preview.model ?? undefined),
    ) || preview.model || "";
    setProvider(nextProvider);
    setModel(nextModel);
  }, [open, preview, imageSelection, imageProviders]);

  const providerChoices = useMemo(() => {
    const options = imageProviders.map((p) => ({
      value: p.provider,
      label: p.displayName ?? p.name,
    }));
    if (!provider) return options;
    if (options.some((p) => p.value === provider)) return options;
    return [...options, { value: provider, label: provider }];
  }, [provider, imageProviders]);

  const selectedProviderMeta = imageProviders.find((p) => p.provider === provider);
  const modelChoices = useMemo(() => {
    const options = listImageModelsForProvider(selectedProviderMeta);
    if (model && !options.includes(model)) options.unshift(model);
    if (preview?.model && !options.includes(preview.model)) options.unshift(preview.model);
    return options;
  }, [selectedProviderMeta, model, preview?.model]);

  // size 也保证当前值在列表里
  const sizeChoices = useMemo(() => {
    if (!size) return SIZE_OPTIONS;
    if (SIZE_OPTIONS.some((s) => s.value === size)) return SIZE_OPTIONS;
    return [...SIZE_OPTIONS, { value: size, label: size }];
  }, [size]);

  const promptDirty = preview ? prompt.trim() !== preview.prompt.trim() : false;
  const negativePromptDirty = preview ? negativePrompt.trim() !== (preview.negativePrompt ?? "").trim() : false;
  const providerDirty = preview ? provider !== preview.provider : false;
  const modelDirty = preview ? Boolean(model) && model !== (preview.model ?? "") : Boolean(model);
  const sizeDirty = preview ? size !== preview.size : false;
  const countDirty = count !== 1;
  const referenceImages = useMemo(
    () => preview?.referenceImages.filter((ref) => includedReferenceImageUrls.includes(ref.url)) ?? [],
    [includedReferenceImageUrls, preview],
  );
  const excludedReferenceImageUrls = useMemo(
    () => preview?.referenceImages
      .filter((ref) => !includedReferenceImageUrls.includes(ref.url))
      .map((ref) => ref.url) ?? [],
    [includedReferenceImageUrls, preview],
  );
  const referenceDirty = excludedReferenceImageUrls.length > 0;
  const anyDirty = promptDirty || negativePromptDirty || providerDirty || modelDirty || sizeDirty || countDirty || referenceDirty;
  const taskKind = resolveComicImageTaskKind(preview?.kind);
  const hasSelectedReferenceImages = referenceImages.length > 0;

  const syncPromptForReferences = (nextIncludedUrls: string[]) => {
    setIncludedReferenceImageUrls(nextIncludedUrls);
    setPrompt((prev) =>
      applyComicTextToImageTaskLead(
        prev,
        resolveComicImageTaskKind(preview?.kind),
        nextIncludedUrls.length > 0,
      ),
    );
  };

  const handleConfirm = () => {
    if (!preview) return;
    const finalPrompt = applyComicTextToImageTaskLead(prompt.trim(), taskKind, hasSelectedReferenceImages);
    const shouldOverridePrompt = finalPrompt !== preview.prompt.trim() || promptDirty || referenceDirty;
    onConfirm({
      promptOverride: shouldOverridePrompt ? finalPrompt : undefined,
      negativePromptOverride: negativePromptDirty ? negativePrompt.trim() : undefined,
      providerOverride: providerDirty ? provider : undefined,
      modelOverride: modelDirty ? model : undefined,
      sizeOverride: sizeDirty ? size : undefined,
      countOverride: countDirty ? count : undefined,
      excludedReferenceImageUrls: referenceDirty ? excludedReferenceImageUrls : undefined,
    });
  };

  const clearPromptAssistResult = () => {
    setPromptAssistAction(null);
    setPromptAssistResult(null);
    setPromptAssistError("");
  };

  const handlePromptAssist = async (action: PromptAssistAction) => {
    if (!preview || !prompt.trim()) return;
    setPromptAssistAction(action);
    setPromptAssistLoading(action);
    setPromptAssistError("");
    try {
      const response = await assistImageGenerationPrompt({
        action,
        title: preview.title,
        kind: preview.kind,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        optimizationInstruction: action === "optimize" ? optimizationInstruction.trim() || undefined : undefined,
        provider: provider || undefined,
        size: size || undefined,
        referenceImages: referenceImages.map((ref) => ({
          kind: ref.kind,
          label: ref.label,
        })),
      });
      if (!response.data) {
        throw new Error("没有收到 Prompt 处理结果。");
      }
      if (action === "optimize" && response.data.optimizedPrompt?.trim()) {
        setPrompt(response.data.optimizedPrompt.trim());
      }
      setPromptAssistResult(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prompt 处理失败。";
      setPromptAssistError(message);
      toast.error("Prompt 处理失败", { description: message });
    } finally {
      setPromptAssistLoading(null);
    }
  };

  const applyManualFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件（PNG / JPEG / WebP）");
      return;
    }
    if (!supportsManualUpload || !onManualUpload) {
      toast.error("当前入口暂不支持人工上传");
      return;
    }
    onManualUpload(file);
  };

  const pasteManualImage = async () => {
    try {
      const file = await readClipboardImageFile();
      if (!file) {
        toast.error("剪贴板里没有可用图片，请先复制图片后再粘贴");
        return;
      }
      applyManualFile(file);
    } catch {
      toast.error("读取剪贴板失败，可改用 Ctrl+V 粘贴，或直接上传文件");
    }
  };

  const handleManualPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = extractImageFileFromClipboardEvent(event.nativeEvent);
    if (!file) return;
    event.preventDefault();
    applyManualFile(file);
  };

  const copyPrompt = async () => {
    const text = applyComicTextToImageTaskLead(prompt, taskKind, hasSelectedReferenceImages).trim();
    if (!text) {
      toast.error("提示词为空，无法复制");
      return;
    }
    if (text !== prompt) {
      setPrompt(text);
    }
    try {
      const result = await copyTextWithFallback(text, {
        downloadFilename: "image-prompt.txt",
        sourceElement: promptTextareaRef.current,
      });
      toast.success(describeCopyResult(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制失败，请手动全选提示词后复制");
    }
  };

  const footer = preview ? (
    <div className="flex w-full flex-col gap-1.5 sm:gap-2">
      <p className="hidden text-[11px] leading-relaxed text-muted-foreground sm:block">
        {manualMode
          ? supportsManualUpload
            ? "复制提示词 → 外部 API 出图 → 粘贴/上传结果继续"
            : "当前入口暂不支持粘贴结果，请把顶部「出图方式」改回自动，或改用该入口旁的上传"
          : anyDirty
            ? "本次将使用上方修改后的参数生图（仅一次性，不保存到角色）"
            : "点击「开始生图」按当前参数生成"}
      </p>
      <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 min-w-14 px-2 sm:h-8 sm:min-w-16 sm:px-2.5" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        {manualMode ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 sm:h-8 sm:px-2.5"
              disabled={submitting || !prompt.trim()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void copyPrompt();
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              复制
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 sm:h-8 sm:px-2.5"
              disabled={submitting || !supportsManualUpload}
              onClick={() => void pasteManualImage()}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              粘贴
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 sm:h-8 sm:px-2.5"
              disabled={submitting || !supportsManualUpload}
              onClick={() => fileInputRef.current?.click()}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {submitting ? "上传中" : "上传"}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" className="h-7 min-w-20 px-2 sm:h-8 sm:min-w-24 sm:px-2.5" onClick={handleConfirm} disabled={submitting || !prompt.trim()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {submitting ? "生成中" : "开始生图"}
          </Button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AppDialogContent
        title={manualMode ? "人工干预生图" : "生图前确认"}
        description={preview?.title}
        footer={footer}
        footerClassName="px-3 py-2 sm:px-6 sm:py-3"
        headerClassName="px-3 py-3 pr-10 sm:px-6 sm:py-4 sm:pr-12"
        bodyClassName="px-3 py-3 sm:px-6 sm:py-4"
        className="max-w-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            applyManualFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在准备生图素材...
          </div>
        ) : !preview ? (
          <div className="py-12 text-center text-sm text-muted-foreground">无预览数据</div>
        ) : manualMode ? (
          <div
            className="space-y-4 outline-none"
            tabIndex={0}
            onPaste={handleManualPaste}
            aria-label="人工干预生图，可粘贴图片"
          >
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">人工出图流程</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>复制下方提示词</li>
                <li>自行调用外部图像 API 或出图工具生成图片</li>
                <li>把结果图片粘贴或上传回来，继续后续流程</li>
              </ol>
              <p className="mt-1.5 text-[11px] opacity-90">此模式下不会调用本系统已配置的图像模型。</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground">提示词</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void copyPrompt();
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制提示词
                </Button>
              </div>
              <textarea
                ref={promptTextareaRef}
                className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                style={{ minHeight: 180, maxHeight: 320 }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={submitting}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {prompt.length} 字符 · 可先编辑再复制
                {hasSelectedReferenceImages
                  ? " · 已选附加图，未加文生图声明"
                  : " · 无附加图，已加文生图声明"}
              </p>
            </div>
            {preview.referenceImages.length > 0 ? (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  附加参考图
                  <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-normal">
                    {referenceImages.length}/{preview.referenceImages.length}
                  </span>
                  {referenceDirty ? (
                    <button
                      type="button"
                      className="ml-auto text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => syncPromptForReferences(preview.referenceImages.map((ref) => ref.url))}
                      disabled={submitting}
                    >
                      全部选中
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ml-auto text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => syncPromptForReferences([])}
                      disabled={submitting}
                    >
                      全部取消
                    </button>
                  )}
                </div>
                <p className="mb-1.5 text-[10px] text-muted-foreground">
                  选中时提示词不加「文生图」声明（方便你在外部工具里配合参考图）；全部取消后会自动加上声明。
                </p>
                <div className="flex flex-wrap gap-2 rounded-md border bg-muted/10 p-2">
                  {preview.referenceImages.map((ref, i) => {
                    const selected = includedReferenceImageUrls.includes(ref.url);
                    return (
                      <button
                        key={`${ref.url}-${i}`}
                        type="button"
                        title={selected ? "点击取消选中这张附加图" : "点击选中这张附加图"}
                        className={`relative overflow-hidden rounded border bg-background ${selected ? "ring-2 ring-primary" : "opacity-50"}`}
                        onClick={() => {
                          const next = selected
                            ? includedReferenceImageUrls.filter((url) => url !== ref.url)
                            : [...includedReferenceImageUrls, ref.url];
                          syncPromptForReferences(next);
                        }}
                        disabled={submitting}
                      >
                        <img
                          src={resolveImageAssetUrl(ref.url)}
                          alt={ref.label}
                          className="h-24 w-auto object-contain"
                        />
                        <span className="block border-t px-1.5 py-1 text-left text-[10px] text-muted-foreground">{ref.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
              {submitting ? "正在保存图片…" : "也可直接在此区域 Ctrl+V 粘贴图片，或点下方「上传图片」"}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 参考图素材 */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                参考素材
                <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-normal">
                  {referenceImages.length}/{preview.referenceImages.length}
                </span>
                {referenceDirty && (
                  <button
                    type="button"
                    className="ml-auto text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => syncPromptForReferences(preview.referenceImages.map((ref) => ref.url))}
                    disabled={submitting || !!promptAssistLoading}
                  >
                    恢复全部
                  </button>
                )}
              </div>
              {preview.referenceImages.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[11px] text-muted-foreground">
                  本次生图不附带参考图（纯文生图）
                </div>
              ) : referenceImages.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[11px] text-muted-foreground">
                  本次生成不会发送参考图（提示词已加上文生图声明）
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/10 p-2">
                  {referenceImages.map((ref, i) => {
                    const kindStyle = REF_KIND_COLOR[ref.kind] ?? REF_KIND_COLOR.asset;
                    const kindLabel = REF_KIND_LABEL[ref.kind] ?? ref.kind;
                    return (
                      <div
                        key={`${ref.url}-${i}`}
                        className="group relative flex flex-col overflow-hidden rounded border bg-background transition-colors hover:border-primary"
                      >
                        <button
                          type="button"
                          className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-sm hover:text-destructive"
                          title="本次不发送这张参考图"
                          onClick={() => {
                            syncPromptForReferences(includedReferenceImageUrls.filter((url) => url !== ref.url));
                            clearPromptAssistResult();
                          }}
                          disabled={submitting || !!promptAssistLoading}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        {/* 高度固定 h-32，宽度按图片比例自适应 */}
                        <a
                          href={resolveImageAssetUrl(ref.url)}
                          target="_blank"
                          rel="noreferrer"
                          title={`${kindLabel} · ${ref.label}（点击查看大图）`}
                          className="flex h-32 items-center justify-center bg-muted/30"
                        >
                          <img
                            src={resolveImageAssetUrl(ref.url)}
                            alt={ref.label}
                            className="block h-full w-auto object-contain"
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </a>
                        <div className="border-t px-1.5 py-1">
                          <span className={`inline-block rounded border px-1 py-px text-[9px] leading-none ${kindStyle}`}>{kindLabel}</span>
                          <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight text-muted-foreground">{ref.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Prompt（可编辑） */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">
                  Prompt
                  {promptDirty && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已修改</span>}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handlePromptAssist("explain")}
                    disabled={submitting || !!promptAssistLoading || !prompt.trim()}
                  >
                    {promptAssistLoading === "explain" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Info className="h-3.5 w-3.5" />}
                    解释 Prompt
                  </Button>
                  {promptDirty && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => {
                        setPrompt(applyComicTextToImageTaskLead(
                          preview.prompt,
                          resolveComicImageTaskKind(preview.kind),
                          includedReferenceImageUrls.length > 0,
                        ));
                        clearPromptAssistResult();
                      }}
                      disabled={submitting || !!promptAssistLoading}
                    >
                      恢复默认
                    </button>
                  )}
                </div>
              </div>
              <textarea
                ref={manualMode ? undefined : promptTextareaRef}
                className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                style={{ minHeight: 160, maxHeight: 280 }}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  clearPromptAssistResult();
                }}
                disabled={submitting || !!promptAssistLoading}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {prompt.length} 字符 · 临时修改不会改动角色/项目设置
                {hasSelectedReferenceImages ? " · 已附带参考图，未加文生图声明" : " · 无参考图，已加文生图声明"}
              </p>
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">优化要求</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => handlePromptAssist("optimize")}
                      disabled={submitting || !!promptAssistLoading || !prompt.trim()}
                    >
                      {promptAssistLoading === "optimize" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      优化 Prompt
                    </Button>
                    {optimizationInstruction && (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        onClick={() => {
                          setOptimizationInstruction("");
                          clearPromptAssistResult();
                        }}
                        disabled={submitting || !!promptAssistLoading}
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  style={{ minHeight: 56, maxHeight: 120 }}
                  value={optimizationInstruction}
                  onChange={(e) => {
                    setOptimizationInstruction(e.target.value);
                    clearPromptAssistResult();
                  }}
                  placeholder="例如：更像水彩、画面更温柔、保留服装和发型"
                  disabled={submitting || !!promptAssistLoading}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{optimizationInstruction.length} 字符 · 仅用于「优化 Prompt」</p>
              </div>
              {(promptAssistResult || promptAssistError) && (
                <div className="mt-2 rounded-md border bg-muted/20 p-2.5 text-xs">
                  {promptAssistError ? (
                    <p className="text-destructive">{promptAssistError}</p>
                  ) : promptAssistResult ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-1.5">
                        {promptAssistAction === "optimize" ? (
                          <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : (
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                        <p className="font-medium leading-relaxed text-foreground">{promptAssistResult.summary}</p>
                      </div>
                      <ul className="space-y-1 pl-5 text-muted-foreground">
                        {promptAssistResult.details.map((item, index) => (
                          <li key={`detail-${index}`} className="list-disc leading-relaxed">{item}</li>
                        ))}
                      </ul>
                      {promptAssistAction === "optimize" && promptAssistResult.changes.length > 0 && (
                        <div className="rounded border bg-background/70 px-2 py-1.5">
                          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">已调整</p>
                          <ul className="space-y-1 pl-4 text-muted-foreground">
                            {promptAssistResult.changes.map((item, index) => (
                              <li key={`change-${index}`} className="list-disc leading-relaxed">{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {promptAssistResult.risks.length > 0 && (
                        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                          <p className="mb-1 text-[11px] font-semibold">注意事项</p>
                          <ul className="space-y-1 pl-4">
                            {promptAssistResult.risks.map((item, index) => (
                              <li key={`risk-${index}`} className="list-disc leading-relaxed">{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {preview.negativePrompt !== undefined && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    负面 Prompt
                    {negativePromptDirty && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已修改</span>}
                  </p>
                  {negativePromptDirty && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => {
                        setNegativePrompt(preview.negativePrompt ?? "");
                        clearPromptAssistResult();
                      }}
                      disabled={submitting || !!promptAssistLoading}
                    >
                      恢复默认
                    </button>
                  )}
                </div>
                <textarea
                  className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  style={{ minHeight: 72, maxHeight: 160 }}
                  value={negativePrompt}
                  onChange={(e) => {
                    setNegativePrompt(e.target.value);
                    clearPromptAssistResult();
                  }}
                  disabled={submitting || !!promptAssistLoading}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{negativePrompt.length} 字符 · 仅用于本次生成</p>
              </div>
            )}

            {/* 参数：provider / model / size / count */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  图片供应商
                  {providerDirty && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已修改</span>}
                </p>
                <SelectControl
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  value={provider}
                  onChange={(e) => {
                    const nextProvider = e.target.value;
                    const nextMeta = imageProviders.find((item) => item.provider === nextProvider);
                    setProvider(nextProvider);
                    setModel(resolveDefaultImageModel(nextMeta));
                    clearPromptAssistResult();
                  }}
                  disabled={submitting || !!promptAssistLoading}
                >
                  {providerChoices.length === 0 ? (
                    <option value="">无可用图片服务，请先在系统设置配置</option>
                  ) : (
                    providerChoices.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))
                  )}
                </SelectControl>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  图像模型
                  {modelDirty && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已修改</span>}
                </p>
                <SelectControl
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    clearPromptAssistResult();
                  }}
                  disabled={submitting || !!promptAssistLoading || modelChoices.length === 0}
                >
                  {modelChoices.length === 0 ? (
                    <option value="">请先选择图片供应商</option>
                  ) : (
                    modelChoices.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))
                  )}
                </SelectControl>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  图片尺寸
                  {sizeDirty && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已修改</span>}
                </p>
                <SelectControl
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  value={size}
                  onChange={(e) => {
                    setSize(e.target.value);
                    clearPromptAssistResult();
                  }}
                  disabled={submitting || !!promptAssistLoading}
                >
                  {sizeChoices.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </SelectControl>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  生成张数
                  {countDirty && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已修改</span>}
                </p>
                <SelectControl
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  value={String(count)}
                  onChange={(e) => {
                    setCount(Number(e.target.value) || 1);
                    clearPromptAssistResult();
                  }}
                  disabled={submitting || !!promptAssistLoading}
                >
                  {COUNT_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </SelectControl>
              </div>
            </div>

          </div>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
