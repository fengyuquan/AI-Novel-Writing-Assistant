/**
 * 生图确认弹窗触发 hook
 *
 * 使用方式：
 *   const flow = useImageGenerationFlow();
 *   flow.start({ ... });
 *   flow.reopenSelection({ selectionId, candidates, selectedIndex, onSuccess });
 *   <ImageGenerationConfirmDialog {...flow.dialogProps} />
 *   <ImageCandidateSelectionDialog {...flow.selectionDialogProps} />
 */
import { useEffect, useState } from "react";

import { toast } from "@/components/ui/toast";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "@/api/comic";
import {
  applyImageSelection,
  isImageSelectionPending,
  type ImageCandidateItem,
} from "@/api/imageRuntime";
import {
  isManualImageInterventionEnabled,
  subscribeManualImageIntervention,
} from "@/lib/manualImageIntervention";

interface StartOptions {
  prepare: () => Promise<ImageGenerationPreview>;
  generate: (overrides: ImageGenerationOverrides) => Promise<unknown>;
  upload?: (file: File) => Promise<unknown>;
  onSuccess?: (result?: unknown) => void;
  onError?: (err: unknown) => void;
}

interface ReopenSelectionOptions {
  selectionId: string;
  candidates: ImageCandidateItem[];
  selectedIndex?: number | null;
  onSuccess?: (result?: unknown) => void;
  onError?: (err: unknown) => void;
}

export function useImageGenerationFlow() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImageGenerationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualMode, setManualMode] = useState(() => isManualImageInterventionEnabled());
  const [activeGenerate, setActiveGenerate] = useState<((o: ImageGenerationOverrides) => Promise<void>) | null>(null);
  const [activeUpload, setActiveUpload] = useState<((file: File) => Promise<void>) | null>(null);

  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ImageCandidateItem[]>([]);
  const [initialSelectedIndex, setInitialSelectedIndex] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState<"select" | "reselect">("select");
  const [selectionSubmitting, setSelectionSubmitting] = useState(false);
  const [pendingOnSuccess, setPendingOnSuccess] = useState<((result?: unknown) => void) | null>(null);
  const [pendingOnError, setPendingOnError] = useState<((err: unknown) => void) | null>(null);

  useEffect(() => subscribeManualImageIntervention(setManualMode), []);

  const resetConfirm = () => {
    setOpen(false);
    setPreview(null);
    setActiveGenerate(null);
    setActiveUpload(null);
    setSubmitting(false);
    setLoading(false);
  };

  const resetSelection = () => {
    setSelectionOpen(false);
    setSelectionId(null);
    setCandidates([]);
    setInitialSelectedIndex(null);
    setSelectionMode("select");
    setSelectionSubmitting(false);
    setPendingOnSuccess(null);
    setPendingOnError(null);
  };

  const reset = () => {
    resetConfirm();
    resetSelection();
  };

  const openSelection = (
    payload: {
      selectionId: string;
      candidates: ImageCandidateItem[];
      selectedIndex?: number | null;
      mode?: "select" | "reselect";
    },
    onSuccess?: (result?: unknown) => void,
    onError?: (err: unknown) => void,
  ) => {
    resetConfirm();
    setSelectionId(payload.selectionId);
    setCandidates(payload.candidates);
    setInitialSelectedIndex(
      typeof payload.selectedIndex === "number" ? payload.selectedIndex : null,
    );
    setSelectionMode(payload.mode ?? "select");
    setPendingOnSuccess(() => onSuccess ?? null);
    setPendingOnError(() => onError ?? null);
    setSelectionOpen(true);
  };

  const start = async ({ prepare, generate, upload, onSuccess, onError }: StartOptions) => {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setActiveGenerate(null);
    setActiveUpload(null);
    try {
      const p = await prepare();
      setPreview(p);
      setLoading(false);

      setActiveGenerate(() => async (overrides: ImageGenerationOverrides) => {
        setSubmitting(true);
        try {
          const result = await generate(overrides);
          if (isImageSelectionPending(result)) {
            openSelection(
              {
                selectionId: result.selectionId,
                candidates: result.candidates,
                selectedIndex: result.selectedIndex,
                mode: "select",
              },
              onSuccess,
              onError,
            );
            return;
          }
          reset();
          onSuccess?.(result);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
          onError?.(err);
          setSubmitting(false);
        }
      });

      if (upload) {
        setActiveUpload(() => async (file: File) => {
          setSubmitting(true);
          try {
            const result = await upload(file);
            reset();
            onSuccess?.(result);
            toast.success("已用本地图片完成生图");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
            onError?.(err);
            setSubmitting(false);
          }
        });
      }
    } catch (err) {
      setLoading(false);
      setOpen(false);
      toast.error(err instanceof Error ? err.message : String(err));
      onError?.(err);
    }
  };

  const reopenSelection = ({
    selectionId: id,
    candidates: items,
    selectedIndex,
    onSuccess,
    onError,
  }: ReopenSelectionOptions) => {
    if (!id || !items.length) {
      toast.error("没有可改选的候选图，请重新生成");
      return;
    }
    openSelection(
      {
        selectionId: id,
        candidates: items,
        selectedIndex,
        mode: "reselect",
      },
      onSuccess,
      onError,
    );
  };

  const cancel = () => {
    reset();
  };

  const cancelSelection = () => {
    const wasReselect = selectionMode === "reselect";
    resetSelection();
    if (!wasReselect) {
      toast.message("已关闭选图。候选图会保留一段时间，可稍后再改选。");
    }
  };

  const confirmSelection = async (index: number) => {
    if (!selectionId) return;
    const mode = selectionMode;
    setSelectionSubmitting(true);
    try {
      const result = await applyImageSelection(selectionId, index);
      const success = pendingOnSuccess;
      reset();
      success?.(result);
      toast.success(mode === "reselect" ? "已改用选中的图片" : "已保存选中的图片");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      pendingOnError?.(err);
      setSelectionSubmitting(false);
    }
  };

  return {
    start,
    reopenSelection,
    dialogProps: {
      open,
      preview,
      loading,
      submitting,
      manualMode,
      supportsManualUpload: Boolean(activeUpload),
      onCancel: cancel,
      onConfirm: (overrides: ImageGenerationOverrides) => {
        if (manualMode) {
          toast.error("当前已开启人工干预，请粘贴或上传图片，而不是调用图像模型");
          return;
        }
        void activeGenerate?.(overrides);
      },
      onManualUpload: (file: File) => {
        if (!activeUpload) {
          toast.error("当前入口暂不支持人工上传，请先关闭人工干预或改用该入口旁的上传按钮");
          return;
        }
        void activeUpload(file);
      },
    },
    selectionDialogProps: {
      open: selectionOpen,
      candidates,
      initialSelectedIndex,
      mode: selectionMode,
      submitting: selectionSubmitting,
      onCancel: cancelSelection,
      onSelect: (index: number) => {
        void confirmSelection(index);
      },
    },
  };
}
