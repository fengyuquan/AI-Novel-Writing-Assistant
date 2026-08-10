import type { ChapterEditorSelectionRange } from "./chapterEditorTypes";

export type ChapterEditorMobilePane = "guide" | "write" | "ai";

export function confirmLeaveUnsavedEditor(isDirty: boolean): boolean {
  if (!isDirty) {
    return true;
  }
  return window.confirm("当前章节有未保存修改，离开将丢失这些修改。确定离开吗？");
}

/** Build a shorter payload for local light audit (selection or opening+ending). */
export function buildLightAuditExcerpt(
  content: string,
  selection?: Pick<ChapterEditorSelectionRange, "text"> | null,
): { excerpt: string; label: string } {
  const selected = selection?.text?.trim() || "";
  if (selected) {
    return {
      excerpt: `【局部选段审校】\n${selected}`,
      label: "当前选段",
    };
  }

  const normalized = content.trim();
  if (!normalized) {
    return { excerpt: "", label: "空正文" };
  }
  if (normalized.length <= 1_600) {
    return { excerpt: normalized, label: "整章（较短）" };
  }

  const head = normalized.slice(0, 800);
  const tail = normalized.slice(-800);
  return {
    excerpt: `【开头】\n${head}\n\n……\n\n【结尾】\n${tail}`,
    label: "开头+结尾",
  };
}

export function buildWordCountHint(wordCount: number, targetWordCount?: number | null): {
  chipLabel: string;
  detail: string;
  tone: "ok" | "short" | "long" | "plain";
} {
  if (typeof targetWordCount !== "number" || targetWordCount <= 0) {
    return {
      chipLabel: `${wordCount} 字`,
      detail: "尚未设定本章目标字数，可先按当前篇幅继续写。",
      tone: "plain",
    };
  }

  const ratio = wordCount / targetWordCount;
  const delta = wordCount - targetWordCount;
  if (ratio < 0.75) {
    return {
      chipLabel: `${wordCount} / ${targetWordCount} 字`,
      detail: `比目标大约少 ${Math.abs(delta)} 字，可再补场景推进或情绪落点。`,
      tone: "short",
    };
  }
  if (ratio > 1.25) {
    return {
      chipLabel: `${wordCount} / ${targetWordCount} 字`,
      detail: `比目标大约多 ${delta} 字，可精简铺垫或合并重复描写。`,
      tone: "long",
    };
  }
  return {
    chipLabel: `${wordCount} / ${targetWordCount} 字`,
    detail: "当前篇幅接近本章目标字数。",
    tone: "ok",
  };
}
