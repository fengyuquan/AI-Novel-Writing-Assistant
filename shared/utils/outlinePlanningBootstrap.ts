import type { OutlineCreateBootstrapDraft } from "../types/outlineCreateBootstrap";
import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumePlan,
  VolumeStrategyPlan,
} from "../types/novel";
import type { BookContractDraft } from "../types/novelWorkflow";
import type { ParsedChapterOutline } from "./outlineImport";

/** Keep aligned with shared/types/volumeBeatSlots.ts required slots. */
const REQUIRED_BEAT_SLOTS = [
  { key: "open_hook", roleLabel: "开卷抓手" },
  { key: "first_escalation", roleLabel: "首次升级" },
  { key: "midpoint_turn", roleLabel: "中段转向" },
  { key: "pressure_lock", roleLabel: "高潮前挤压" },
  { key: "climax", roleLabel: "卷高潮" },
  { key: "end_hook", roleLabel: "卷尾钩子" },
] as const;

function trimText(value: string | null | undefined, maxChars: number): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

function pickChapterText(
  chapter: { title: string; summary?: string | null; purpose?: string | null },
  maxChars: number,
): string {
  return trimText(chapter.purpose || chapter.summary || chapter.title, maxChars);
}

function stageLabelByChapterOrder(parsed: ParsedChapterOutline): Map<number, string> {
  const labels = new Map<number, string>();
  let order = 1;
  for (const volume of parsed.volumes) {
    for (const chapter of volume.chapters) {
      const label = chapter.stageLabel?.trim();
      if (label) {
        labels.set(order, label);
      }
      order += 1;
    }
  }
  return labels;
}

function dominantStageLabel(
  orders: number[],
  labels: Map<number, string>,
): string | null {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const label = labels.get(order);
    if (!label) {
      continue;
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Map imported chapters onto the fixed required beat slots so rhythm UI and
 * downstream volume generation share the same contract.
 */
function distributeOrdersToRequiredSlots(chapterOrders: number[]): Array<{
  key: (typeof REQUIRED_BEAT_SLOTS)[number]["key"];
  roleLabel: string;
  orders: number[];
}> {
  if (chapterOrders.length === 0) {
    return [];
  }

  const spans: number[][] = REQUIRED_BEAT_SLOTS.map(() => []);
  const count = chapterOrders.length;
  const slotCount = REQUIRED_BEAT_SLOTS.length;

  if (count <= slotCount) {
    chapterOrders.forEach((order, index) => {
      spans[index]?.push(order);
    });
    // Pad empty trailing slots with the last chapter so required beats stay valid.
    const lastOrder = chapterOrders[chapterOrders.length - 1]!;
    for (let index = count; index < slotCount; index += 1) {
      spans[index] = [lastOrder];
    }
  } else {
    for (let index = 0; index < slotCount; index += 1) {
      const start = Math.floor((index * count) / slotCount);
      const end = Math.floor(((index + 1) * count) / slotCount);
      spans[index] = chapterOrders.slice(start, Math.max(start + 1, end));
    }
  }

  return REQUIRED_BEAT_SLOTS.map((slot, index) => ({
    key: slot.key,
    roleLabel: slot.roleLabel,
    orders: spans[index] ?? [],
  }));
}

export function buildOutlineStoryInput(params: {
  bootstrap: OutlineCreateBootstrapDraft;
  parsed: ParsedChapterOutline;
}): string {
  const { bootstrap, parsed } = params;
  const chapterLines = parsed.volumes
    .flatMap((volume) => volume.chapters)
    .slice(0, 36)
    .map((chapter, index) => {
      const detail = trimText(chapter.purpose || chapter.summary, 120);
      return `第${index + 1}章《${chapter.title}》：${detail}`;
    });

  return [
    bootstrap.description.trim(),
    "",
    bootstrap.bookSellingPoint.trim() ? `核心卖点：${bootstrap.bookSellingPoint.trim()}` : "",
    bootstrap.competingFeel.trim() ? `竞品体感：${bootstrap.competingFeel.trim()}` : "",
    bootstrap.first30ChapterPromise.trim() ? `前30章承诺：${bootstrap.first30ChapterPromise.trim()}` : "",
    bootstrap.targetAudience.trim() ? `目标读者：${bootstrap.targetAudience.trim()}` : "",
    bootstrap.commercialTags.length > 0 ? `标签：${bootstrap.commercialTags.join("、")}` : "",
    "",
    "大纲章节摘要：",
    ...chapterLines,
  ].filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n").trim();
}

export function buildOutlineBookContractDraft(params: {
  bootstrap: OutlineCreateBootstrapDraft;
  parsed: ParsedChapterOutline;
}): BookContractDraft {
  const chapters = params.parsed.volumes.flatMap((volume) => volume.chapters);
  const at = (index: number) => chapters[index] ? pickChapterText(chapters[index], 180) : "";
  const protagonist = params.bootstrap.characters.find((item) => item.selected !== false)
    ?? params.bootstrap.characters[0];

  return {
    readingPromise: trimText(
      params.bootstrap.first30ChapterPromise || params.bootstrap.description,
      400,
    ) || "按导入大纲兑现开局承诺与主线回报。",
    protagonistFantasy: trimText(
      protagonist
        ? `${protagonist.name}：${protagonist.personality || protagonist.background || "按大纲成长"}`
        : "主角按大纲完成处境反转与能力成长",
      400,
    ),
    coreSellingPoint: trimText(params.bootstrap.bookSellingPoint || params.bootstrap.description, 400)
      || "兑现大纲中的核心卖点与阶段性回报。",
    chapter3Payoff: at(2) || at(0) || "开局危机与金手指初步兑现。",
    chapter10Payoff: at(9) || at(Math.min(4, Math.max(0, chapters.length - 1))) || "中前期悬念与能力反馈升级。",
    chapter30Payoff: at(29)
      || at(Math.max(0, chapters.length - 1))
      || trimText(params.bootstrap.first30ChapterPromise, 180)
      || "前30章承诺收束并钩住下一阶段。",
    escalationLadder: chapters.length > 1
      ? `从第1章「${chapters[0].title}」推进到第${chapters.length}章「${chapters[chapters.length - 1].title}」，压力与悬念逐段抬升。`
      : "按导入大纲逐步抬升压力与回报。",
    relationshipMainline: protagonist
      ? `${protagonist.name}与关键配角/对手的关系随大纲阶段变化。`
      : "人物关系随大纲阶段推进。",
    absoluteRedLines: [
      "不得改写已导入章节清单的既定事件顺序作为默认设定。",
      "不得提前消耗大纲后段才安排的核心反转。",
    ],
  };
}

export function enrichVolumesFromOutline(params: {
  volumes: VolumePlan[];
  parsed: ParsedChapterOutline;
  bootstrap: OutlineCreateBootstrapDraft;
}): VolumePlan[] {
  const now = new Date().toISOString();
  const stageLabels = stageLabelByChapterOrder(params.parsed);

  return params.volumes.map((volume) => {
    const chapters = volume.chapters;
    const first = chapters[0];
    const mid = chapters[Math.floor(chapters.length / 2)];
    const last = chapters[chapters.length - 1];
    const stageSet = new Set<string>();
    for (const chapter of chapters) {
      const label = stageLabels.get(chapter.chapterOrder);
      if (label) {
        stageSet.add(label);
      }
    }

    const summary = trimText(
      volume.summary
        || (stageSet.size > 0 ? [...stageSet].join("；") : "")
        || chapters.slice(0, 3).map((chapter) => pickChapterText(chapter, 80)).join("；"),
      600,
    );

    return {
      ...volume,
      summary: summary || volume.title,
      openingHook: trimText(volume.openingHook || (first ? pickChapterText(first, 220) : ""), 400),
      mainPromise: trimText(
        volume.mainPromise
          || params.bootstrap.first30ChapterPromise
          || (first?.purpose ?? first?.summary)
          || volume.title,
        400,
      ),
      primaryPressureSource: trimText(
        volume.primaryPressureSource || (first ? pickChapterText(first, 220) : params.bootstrap.bookSellingPoint),
        400,
      ),
      coreSellingPoint: trimText(
        volume.coreSellingPoint || params.bootstrap.bookSellingPoint || params.bootstrap.description,
        400,
      ),
      escalationMode: trimText(
        volume.escalationMode
          || (stageSet.size > 1 ? [...stageSet].join(" → ") : "")
          || (mid ? pickChapterText(mid, 220) : ""),
        400,
      ),
      protagonistChange: trimText(
        volume.protagonistChange
          || (last?.purpose ?? mid?.purpose ?? params.bootstrap.characters[0]?.development)
          || "主角按大纲阶段完成认知与能力变化",
        400,
      ),
      midVolumeRisk: trimText(
        volume.midVolumeRisk || (mid ? pickChapterText(mid, 220) : "中段若偏离大纲节奏，追读与悬念会塌陷"),
        400,
      ),
      climax: trimText(volume.climax || (last ? pickChapterText(last, 220) : volume.title), 400),
      payoffType: trimText(volume.payoffType || "阶段承诺兑现 + 下一段钩子", 200),
      nextVolumeHook: trimText(
        volume.nextVolumeHook || (last ? `承接第${last.chapterOrder}章「${last.title}」后的新压力` : "进入下一阶段压力"),
        400,
      ),
      resetPoint: trimText(volume.resetPoint || "本卷承诺兑现后，留下可升级的新危机", 400),
      status: volume.status || "draft",
      updatedAt: now,
    };
  });
}

export function buildOutlineStrategyAndBeatSheets(params: {
  volumes: VolumePlan[];
  parsed: ParsedChapterOutline;
  bootstrap: OutlineCreateBootstrapDraft;
}): {
  volumes: VolumePlan[];
  strategyPlan: VolumeStrategyPlan;
  beatSheets: VolumeBeatSheet[];
} {
  const enriched = enrichVolumesFromOutline(params);
  const stageLabels = stageLabelByChapterOrder(params.parsed);

  const strategyPlan: VolumeStrategyPlan = {
    recommendedVolumeCount: Math.max(1, enriched.length),
    hardPlannedVolumeCount: Math.max(1, enriched.length),
    readerRewardLadder: trimText(
      params.bootstrap.first30ChapterPromise || params.bootstrap.bookSellingPoint || "按导入大纲逐段兑现读者回报",
      400,
    ),
    escalationLadder: enriched.map((volume) => volume.title).join(" → "),
    midpointShift: trimText(
      enriched[Math.floor(enriched.length / 2)]?.escalationMode
        || enriched[0]?.midVolumeRisk
        || "中段压力升级并改写主角判断",
      400,
    ),
    notes: "由大纲导入生成的卷战略草稿，可在卷规划页继续修订；章节清单以导入结果为准。",
    volumes: enriched.map((volume) => ({
      sortOrder: volume.sortOrder,
      planningMode: "hard" as const,
      roleLabel: volume.title,
      coreReward: trimText(volume.mainPromise || volume.coreSellingPoint || volume.summary, 240),
      escalationFocus: trimText(volume.escalationMode || volume.climax || volume.summary, 240),
      uncertaintyLevel: "medium" as const,
    })),
    uncertainties: [],
  };

  const beatSheets: VolumeBeatSheet[] = [];
  const nextVolumes = enriched.map((volume) => {
    const orders = volume.chapters.map((chapter) => chapter.chapterOrder);
    const slots = distributeOrdersToRequiredSlots(orders);
    const beatKeyByOrder = new Map<number, string>();
    const beats: VolumeBeat[] = [];

    for (const slot of slots) {
      if (slot.orders.length === 0) {
        continue;
      }
      const groupChapters = volume.chapters.filter((chapter) => slot.orders.includes(chapter.chapterOrder));
      const first = groupChapters[0];
      const last = groupChapters[groupChapters.length - 1];
      const stageTitle = dominantStageLabel(slot.orders, stageLabels);
      const roleLabel = slot.roleLabel;
      const mustDeliver = groupChapters
        .map((chapter) => trimText(chapter.purpose || chapter.title, 80))
        .filter(Boolean)
        .slice(0, 4);
      if (mustDeliver.length === 0) {
        mustDeliver.push(trimText(first?.title || roleLabel, 80) || roleLabel);
      }
      beats.push({
        key: slot.key,
        label: roleLabel,
        title: stageTitle || first?.title || roleLabel,
        summary: trimText(
          groupChapters.map((chapter) => pickChapterText(chapter, 60)).join("；"),
          280,
        ) || roleLabel,
        chapterSpanHint: first && last
          ? (first.chapterOrder === last.chapterOrder
            ? `第${first.chapterOrder}章`
            : `第${first.chapterOrder}-${last.chapterOrder}章`)
          : "1章",
        mustDeliver,
      });
      // First assigned slot wins when padding reuses the last chapter.
      for (const order of slot.orders) {
        if (!beatKeyByOrder.has(order)) {
          beatKeyByOrder.set(order, slot.key);
        }
      }
    }

    beatSheets.push({
      volumeId: volume.id,
      volumeSortOrder: volume.sortOrder,
      status: "generated",
      beats,
    });

    return {
      ...volume,
      chapters: volume.chapters.map((chapter) => ({
        ...chapter,
        beatKey: beatKeyByOrder.get(chapter.chapterOrder) ?? chapter.beatKey ?? null,
      })),
    };
  });

  return {
    volumes: nextVolumes,
    strategyPlan,
    beatSheets,
  };
}
