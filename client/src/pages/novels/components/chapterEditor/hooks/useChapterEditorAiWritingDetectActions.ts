import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Chapter, ChapterEditorAiWritingDetectResponse } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { detectChapterAiWriting } from "@/api/novel";
import { toast } from "@/components/ui/toast";

export function useChapterEditorAiWritingDetectActions(params: {
  novelId: string;
  chapter: Chapter | undefined;
  contentDraft: string;
  llm: {
    provider?: LLMProvider;
    model?: string;
  };
  resetToken: string;
}) {
  const { novelId, chapter, contentDraft, llm, resetToken } = params;
  const [result, setResult] = useState<ChapterEditorAiWritingDetectResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setErrorMessage(null);
  }, [resetToken]);

  const detectMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      if (!contentDraft.trim()) {
        throw new Error("当前正文为空，请先写入内容再检测。");
      }
      return detectChapterAiWriting(novelId, chapter.id, {
        content: contentDraft,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.15,
        includeDeterministic: true,
      });
    },
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: (response) => {
      const data = response.data;
      if (!data) {
        setErrorMessage("检测未返回结果，请重试。");
        return;
      }
      setResult(data);
      setErrorMessage(null);
      toast.success(
        data.issues.length > 0
          ? `已找出 ${data.issues.length} 处像 AI 的写法，可定位后改。`
          : "未发现明显 AI 味，可继续写。",
      );
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "AI 写法检测失败，请重试。";
      setErrorMessage(message);
      toast.error(message);
    },
  });

  return {
    aiWritingDetectResult: result,
    aiWritingDetectErrorMessage: errorMessage,
    aiWritingDetectMutation: detectMutation,
  };
}
