export type GenerationCountFieldKey =
  | "ideaInspirationCount"
  | "titleCandidateCount"
  | "worldAxiomCount"
  | "characterCandidateDefaultCount"
  | "coverImageCount"
  | "maxVolumeCount"
  | "estimatedChapterDefault"
  | "bookAnalysisCharacterMax"
  | "comicSceneMax"
  | "directorCandidateCount"
  | "directorTitleOptionsMax";

export type GenerationCountGroup =
  | "opening"
  | "planning"
  | "characterWorld"
  | "coverComic"
  | "bookAnalysis";

export interface GenerationCountFieldDescriptor {
  key: GenerationCountFieldKey;
  settingKey: string;
  label: string;
  description: string;
  group: GenerationCountGroup;
  groupLabel: string;
  min: number;
  max: number;
  defaultValue: number;
}

/** Hard ceiling for volume planning schemas; runtime setting cannot exceed this. */
export const GENERATION_VOLUME_COUNT_HARD_MAX = 24;

export const GENERATION_COUNT_FIELD_DESCRIPTORS: GenerationCountFieldDescriptor[] = [
  {
    key: "ideaInspirationCount",
    settingKey: "generation.ideaInspirationCount",
    label: "开书灵感条数",
    description: "点「没有想法？」时，一次给出几条可选用的起始灵感。",
    group: "opening",
    groupLabel: "开书",
    min: 3,
    max: 12,
    defaultValue: 5,
  },
  {
    key: "titleCandidateCount",
    settingKey: "generation.titleCandidateCount",
    label: "书名候选数",
    description: "生成书名时默认给出几条候选，便于挑选。",
    group: "opening",
    groupLabel: "开书",
    min: 3,
    max: 24,
    defaultValue: 12,
  },
  {
    key: "estimatedChapterDefault",
    settingKey: "generation.estimatedChapterDefault",
    label: "预估章数默认",
    description: "新建小说时，若未填写目标章数，默认按这个长度规划。",
    group: "planning",
    groupLabel: "规划",
    min: 12,
    max: 2000,
    defaultValue: 80,
  },
  {
    key: "maxVolumeCount",
    settingKey: "generation.maxVolumeCount",
    label: "卷规划上限",
    description: "整书卷级规划最多允许拆成几卷。",
    group: "planning",
    groupLabel: "规划",
    min: 1,
    max: GENERATION_VOLUME_COUNT_HARD_MAX,
    defaultValue: GENERATION_VOLUME_COUNT_HARD_MAX,
  },
  {
    key: "directorCandidateCount",
    settingKey: "generation.directorCandidateCount",
    label: "导演方向候选套数",
    description: "自动导演一次给出几套可挑选的书级方向卡片。",
    group: "planning",
    groupLabel: "规划",
    min: 2,
    max: 6,
    defaultValue: 2,
  },
  {
    key: "directorTitleOptionsMax",
    settingKey: "generation.directorTitleOptionsMax",
    label: "导演书名备选最多",
    description: "自动导演规划方向时，每套方向最多附带几条封面向书名备选。",
    group: "planning",
    groupLabel: "规划",
    min: 1,
    max: 8,
    defaultValue: 4,
  },
  {
    key: "worldAxiomCount",
    settingKey: "generation.worldAxiomCount",
    label: "世界核心公理条数",
    description: "生成世界观最高约束时，一次产出几条核心公理。",
    group: "characterWorld",
    groupLabel: "角色与世界",
    min: 3,
    max: 12,
    defaultValue: 5,
  },
  {
    key: "characterCandidateDefaultCount",
    settingKey: "generation.characterCandidateDefaultCount",
    label: "角色候选默认建议数",
    description: "未指定数量时，系统建议最多生成几个候选角色。",
    group: "characterWorld",
    groupLabel: "角色与世界",
    min: 1,
    max: 6,
    defaultValue: 3,
  },
  {
    key: "coverImageCount",
    settingKey: "generation.coverImageCount",
    label: "封面图张数",
    description: "生成小说封面时默认一次出几张图供挑选。",
    group: "coverComic",
    groupLabel: "封面与漫画",
    min: 1,
    max: 4,
    defaultValue: 2,
  },
  {
    key: "comicSceneMax",
    settingKey: "generation.comicSceneMax",
    label: "漫画场景最多识别",
    description: "生成分格脚本时，本话最多识别几个场景地点。",
    group: "coverComic",
    groupLabel: "封面与漫画",
    min: 3,
    max: 16,
    defaultValue: 8,
  },
  {
    key: "bookAnalysisCharacterMax",
    settingKey: "generation.bookAnalysisCharacterMax",
    label: "拆书角色最多生成",
    description: "拆书未指定角色名时，最多提炼几个最关键角色。",
    group: "bookAnalysis",
    groupLabel: "拆书",
    min: 1,
    max: 12,
    defaultValue: 6,
  },
];

export type GenerationCountSettings = Record<GenerationCountFieldKey, number>;

export interface GenerationCountSettingsView {
  settings: GenerationCountSettings;
  fields: GenerationCountFieldDescriptor[];
}

export type GenerationCountSettingsInput = Partial<GenerationCountSettings>;

export function buildDefaultGenerationCountSettings(): GenerationCountSettings {
  const settings = {} as GenerationCountSettings;
  for (const field of GENERATION_COUNT_FIELD_DESCRIPTORS) {
    settings[field.key] = field.defaultValue;
  }
  return settings;
}

export function getGenerationCountFieldDescriptor(
  key: GenerationCountFieldKey,
): GenerationCountFieldDescriptor {
  const field = GENERATION_COUNT_FIELD_DESCRIPTORS.find((item) => item.key === key);
  if (!field) {
    throw new Error(`Unknown generation count field: ${key}`);
  }
  return field;
}
