/**
 * 漫画保真校验：对照原文检查分格对白/事实，结果写入 scriptConfig.qualityDebt，不阻断出图。
 */
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  comicFidelityCheckPrompt,
  type ComicFidelityCheckOutput,
} from "../../prompting/prompts/comic/comic.prompts";
import type { SourceBundle } from "../adaptation/contracts/sourceBundle";

export class ComicFidelityCheckService {
  async checkEpisode(
    episodeId: string,
    provider?: LLMProvider,
  ): Promise<ComicFidelityCheckOutput | null> {
    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: {
        panels: { orderBy: { order: "asc" } },
        project: { include: { sourceBundle: true } },
      },
    });
    if (!episode) return null;

    const sourceText =
      (episode.sourceText ?? "").trim()
      || episode.project.sourceInput?.trim()
      || "";
    if (!sourceText || episode.panels.length === 0) return null;

    let hardFactsDigest = "";
    if (episode.project.sourceBundle?.bundleJson) {
      try {
        const bundle = JSON.parse(episode.project.sourceBundle.bundleJson) as SourceBundle;
        hardFactsDigest = (bundle.hardFacts ?? [])
          .map((f) => `- [${f.category}] ${f.text}`)
          .join("\n");
      } catch {
        /* ignore */
      }
    }

    const panelDigest = episode.panels
      .map((panel) => {
        let dialogues = "";
        try {
          const list = panel.dialogues
            ? (JSON.parse(panel.dialogues) as Array<{ speaker?: string; text?: string }>)
            : [];
          dialogues = list
            .map((d) => `${d.speaker ?? "?"}：${d.text ?? ""}`)
            .join(" / ");
        } catch {
          dialogues = panel.dialogues ?? "";
        }
        return `#${panel.order} [${panel.panelType ?? "?"}] ${panel.action}${dialogues ? ` | 对白：${dialogues}` : ""}`;
      })
      .join("\n");

    const result = await runStructuredPrompt({
      asset: comicFidelityCheckPrompt,
      promptInput: {
        projectTitle: episode.project.title,
        episodeOrder: episode.order,
        episodeTitle: episode.title ?? `第 ${episode.order} 话`,
        sourceText,
        panelDigest,
        hardFactsDigest: hardFactsDigest || undefined,
      },
      options: { temperature: 0.1, provider },
    });

    const output = result.output;
    // 强制：局部问题不得阻断后续出图
    const qualityDebt = {
      ...output,
      continueAllowed: true,
      checkedAt: new Date().toISOString(),
    };

    let scriptConfig: Record<string, unknown> = {};
    if (episode.scriptConfig) {
      try {
        scriptConfig = JSON.parse(episode.scriptConfig) as Record<string, unknown>;
      } catch {
        scriptConfig = {};
      }
    }
    scriptConfig.qualityDebt = qualityDebt;
    await prisma.comicEpisode.update({
      where: { id: episodeId },
      data: { scriptConfig: JSON.stringify(scriptConfig) },
    });

    return qualityDebt;
  }
}

export const comicFidelityCheckService = new ComicFidelityCheckService();
