import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  Download,
  ImageIcon,
  Layers3,
  Sparkles,
  SquareStack,
  UsersRound,
} from "lucide-react";
import type { ComicEpisode, ComicProjectDetail } from "@/api/comic";

export type ComicGuideTab = "outline" | "characters" | "scenes" | "panels" | "export";

export type ComicGuideStepId =
  | "import_source"
  | "generate_outline"
  | "generate_script"
  | "character_sheets"
  | "panel_images"
  | "export";

export interface ComicGuideStepMeta {
  id: ComicGuideStepId;
  label: string;
  tab: ComicGuideTab;
}

export const COMIC_GUIDE_STEPS: ComicGuideStepMeta[] = [
  { id: "import_source", label: "导入内容", tab: "outline" },
  { id: "generate_outline", label: "分话大纲", tab: "outline" },
  { id: "generate_script", label: "分格脚本", tab: "outline" },
  { id: "character_sheets", label: "角色设定", tab: "characters" },
  { id: "panel_images", label: "格子出图", tab: "panels" },
  { id: "export", label: "导出成品", tab: "export" },
];

export interface ComicWorkspaceGuide {
  stepId: ComicGuideStepId;
  stepIndex: number;
  title: string;
  description: string;
  consequence: string;
  actionLabel: string;
  tab: ComicGuideTab;
  icon: LucideIcon;
  tone: "info" | "success" | "warning";
  doneStepIds: ComicGuideStepId[];
}

function parseSheetStatus(sheetData: string | null | undefined): string {
  if (!sheetData?.trim()) return "idle";
  try {
    const parsed = JSON.parse(sheetData) as { status?: string };
    return parsed.status ?? "idle";
  } catch {
    return "idle";
  }
}

function countScriptedEpisodes(episodes: ComicEpisode[]): number {
  return episodes.filter((ep) => (ep._count?.panels ?? 0) > 0 || Boolean(ep.scriptConfig)).length;
}

function resolveProjectAdaptationMode(
  stylePreset: string | null | undefined,
  sourceType: string,
): "faithful" | "creative" {
  if (stylePreset?.trim()) {
    try {
      const parsed = JSON.parse(stylePreset) as { adaptationMode?: string };
      if (parsed.adaptationMode === "faithful" || parsed.adaptationMode === "creative") {
        return parsed.adaptationMode;
      }
    } catch {
      /* ignore */
    }
  }
  return sourceType === "text_import" ? "faithful" : "creative";
}

export function resolveComicWorkspaceGuide(input: {
  project: ComicProjectDetail;
  episodes: ComicEpisode[];
  hasImageProvider: boolean;
}): ComicWorkspaceGuide {
  const { project, episodes, hasImageProvider } = input;
  const adaptationMode = resolveProjectAdaptationMode(project.stylePreset, project.sourceType);
  const isFaithfulText = project.sourceType === "text_import" && adaptationMode === "faithful";
  const hasBundle = Boolean(project.sourceBundle);
  const hasEpisodes = episodes.length > 0;
  const scriptedCount = countScriptedEpisodes(episodes);
  const hasScript = scriptedCount > 0;
  const characters = project.characters ?? [];
  const sheetReadyCount = characters.filter((c) => parseSheetStatus(c.sheetData) === "done").length;
  const hasCharacterSheet = sheetReadyCount > 0;
  const doneStepIds: ComicGuideStepId[] = [];

  if (hasBundle) doneStepIds.push("import_source");
  if (hasEpisodes) doneStepIds.push("generate_outline");
  if (hasScript) doneStepIds.push("generate_script");
  if (hasCharacterSheet || (hasScript && characters.length === 0)) {
    doneStepIds.push("character_sheets");
  }

  if (!hasBundle) {
    return {
      stepId: "import_source",
      stepIndex: 0,
      title: "下一步：导入内容源",
      description: project.sourceType === "novel_import"
        ? "先把选定小说整理成漫画可用的内容源，后面才能生成分话大纲和角色。"
        : isFaithfulText
          ? "先把你粘贴的新闻/报道整理成内容源；保真模式下系统不会改写引语和事实。"
          : "先把你刚填的故事内容整理成漫画内容源，系统才能据此拆话和分格。",
      consequence: "内容源就绪后，就可以一键生成分话大纲。",
      actionLabel: "去导入内容源",
      tab: "outline",
      icon: Layers3,
      tone: "info",
      doneStepIds,
    };
  }

  if (!hasEpisodes) {
    return {
      stepId: "generate_outline",
      stepIndex: 1,
      title: "下一步：生成分话大纲",
      description: isFaithfulText
        ? "内容源已就绪。按报道段落生成分话大纲，每话会带上对应原文摘录，供保真分格使用。"
        : "内容源已就绪。先生成前几话大纲，把故事拆成一话一话的漫画单元。",
      consequence: "有了大纲后，就可以一键或按话生成分格脚本。",
      actionLabel: "去生成大纲",
      tab: "outline",
      icon: BookOpenText,
      tone: "info",
      doneStepIds,
    };
  }

  if (!hasScript) {
    return {
      stepId: "generate_script",
      stepIndex: 2,
      title: "下一步：生成分格脚本",
      description: isFaithfulText
        ? `已有 ${episodes.length} 话大纲。生成分格时气泡文字会尽量沿用原文引语；若有偏差可在分格页手动改字。`
        : `已有 ${episodes.length} 话大纲。可点「一键生成分格」批量处理，也可按话单独生成。`,
      consequence: "分格脚本出来后，建议先补角色设定图，再批量出图更稳。",
      actionLabel: "去生成分格",
      tab: "outline",
      icon: SquareStack,
      tone: "info",
      doneStepIds,
    };
  }

  if (characters.length > 0 && !hasCharacterSheet) {
    return {
      stepId: "character_sheets",
      stepIndex: 3,
      title: "下一步：生成角色设定图",
      description: `已有分格脚本。先给 ${characters.length} 位角色生成三视图，后面格子出图时角色长相会更统一。`,
      consequence: "至少完成主角设定图后，就可以去格子图批量出图。",
      actionLabel: "去角色设定",
      tab: "characters",
      icon: UsersRound,
      tone: hasImageProvider ? "info" : "warning",
      doneStepIds,
    };
  }

  if (!hasImageProvider) {
    return {
      stepId: "panel_images",
      stepIndex: 4,
      title: "下一步：先选好图片模型",
      description: "脚本已准备好，但还没有可用的图片服务。请先在页面顶部选择图片供应商和图像模型。",
      consequence: "选好模型后，就可以在「格子图」里批量生成画面。",
      actionLabel: "查看出图入口",
      tab: "panels",
      icon: ImageIcon,
      tone: "warning",
      doneStepIds,
    };
  }

  return {
    stepId: "panel_images",
    stepIndex: 4,
    title: "下一步：生成格子图或导出",
    description: hasCharacterSheet
      ? `角色设定已完成 ${sheetReadyCount}/${Math.max(characters.length, 1)}。可去「格子图」批量出图；若已有满意画面，也可直接「导出」。`
      : "分格脚本已就绪。可去「格子图」批量出图，或先到「导出」查看导出方式。",
    consequence: "出图完成后，可到「导出」下载长图或切片。",
    actionLabel: "去生成格子图",
    tab: "panels",
    icon: Sparkles,
    tone: "success",
    doneStepIds,
  };
}

export function comicGuideStepState(
  stepId: ComicGuideStepId,
  guide: ComicWorkspaceGuide,
): "done" | "current" | "upcoming" {
  if (guide.doneStepIds.includes(stepId) && stepId !== guide.stepId) {
    return "done";
  }
  if (stepId === guide.stepId) {
    return "current";
  }
  const stepOrder = COMIC_GUIDE_STEPS.findIndex((s) => s.id === stepId);
  if (stepOrder >= 0 && stepOrder < guide.stepIndex) {
    return "done";
  }
  return "upcoming";
}

/** Kept for potential export-focused CTA reuse. */
export const comicExportGuideIcon = Download;
