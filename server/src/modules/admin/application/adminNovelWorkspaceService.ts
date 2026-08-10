import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { getNovelDrilldownOverview } from "./adminDrilldownService";

const OUTLINE_PREVIEW_CHARS = 4000;
const RECENT_TASK_LIMIT = 30;
const RECENT_JOB_LIMIT = 20;

function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // CJK-heavy content: count non-whitespace characters as a practical "字数".
  const cjk = trimmed.replace(/\s+/g, "").length;
  return cjk;
}

function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export interface WorkspaceChapterItem {
  id: string;
  order: number;
  title: string;
  generationState: string;
  chapterStatus: string | null;
  /** Catalog does not load full content; true when chapter has non-empty body. */
  hasContent: boolean;
  qualityScore: number | null;
  updatedAt: string | null;
}

export interface WorkspaceCharacterCard {
  id: string;
  name: string;
  role: string;
  castRole: string | null;
  gender: string;
  identityLabel: string | null;
  factionLabel: string | null;
  personality: string | null;
  firstImpression: string | null;
  appearance: string | null;
  signatureDetail: string | null;
  currentState: string | null;
  currentGoal: string | null;
  relationToProtagonist: string | null;
}

export interface WorkspaceTaskItem {
  kind: "workflow" | "generation";
  id: string;
  title: string;
  status: string;
  progress: number;
  currentStage: string | null;
  currentItemLabel: string | null;
  checkpointType: string | null;
  checkpointSummary: string | null;
  error: string | null;
  pendingManualRecovery: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface WorkspacePipelineSummary {
  runningCount: number;
  failedOrRecoveryCount: number;
  queuedCount: number;
  latestRunning: WorkspaceTaskItem[];
  attention: WorkspaceTaskItem[];
}

export interface WorkspaceVolumeItem {
  id: string;
  sortOrder: number;
  title: string;
  summary: string | null;
  status: string;
}

export interface NovelWorkspacePayload {
  novel: {
    id: string;
    title: string;
    description: string | null;
    status: string | null;
    projectStatus: string | null;
    outlineStatus: string | null;
    storylineStatus: string | null;
    estimatedChapterCount: number | null;
    defaultChapterLength: number | null;
    outlinePreview: string | null;
    outline: string | null;
    structuredOutlinePreview: string | null;
    updatedAt: string | null;
  };
  chapters: WorkspaceChapterItem[];
  characters: WorkspaceCharacterCard[];
  tasks: WorkspaceTaskItem[];
  pipeline: WorkspacePipelineSummary;
  volumes: WorkspaceVolumeItem[];
  bible: {
    id: string;
    coreSetting: string | null;
    mainPromise: string | null;
    characterArcs: string | null;
    worldRules: string | null;
  } | null;
  structuredOutline: string | null;
  counts: {
    chapters: number;
    characters: number;
    workflowTasks: number;
    generationJobs: number;
    volumes: number;
    childModelCount: number;
    totalRelatedRows: number;
  };
  children: Array<{ model: string; foreignKey: string; count: number; pinned: boolean }>;
}

export interface WorkspaceChapterDetail {
  id: string;
  novelId: string;
  order: number;
  title: string;
  content: string;
  generationState: string;
  chapterStatus: string | null;
  targetWordCount: number | null;
  wordCount: number;
  qualityScore: number | null;
  continuityScore: number | null;
  characterScore: number | null;
  pacingScore: number | null;
  hook: string | null;
  expectation: string | null;
  mustAvoid: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export async function getNovelWorkspace(novelId: string): Promise<NovelWorkspacePayload> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      projectStatus: true,
      outlineStatus: true,
      storylineStatus: true,
      estimatedChapterCount: true,
      defaultChapterLength: true,
      outline: true,
      structuredOutline: true,
      updatedAt: true,
    },
  });
  if (!novel) {
    throw new AppError("小说不存在。", 404);
  }

  const [chaptersRaw, chaptersWithBody, charactersRaw, workflowTasks, generationJobs, volumes, bible, overview] =
    await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          generationState: true,
          chapterStatus: true,
          qualityScore: true,
          updatedAt: true,
        },
      }),
      prisma.chapter.findMany({
        where: {
          novelId,
          NOT: {
            OR: [{ content: null }, { content: "" }],
          },
        },
        select: { id: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          castRole: true,
          gender: true,
          identityLabel: true,
          factionLabel: true,
          personality: true,
          firstImpression: true,
          appearance: true,
          signatureDetail: true,
          currentState: true,
          currentGoal: true,
          relationToProtagonist: true,
        },
      }),
      prisma.novelWorkflowTask.findMany({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
        take: RECENT_TASK_LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          currentStage: true,
          currentItemLabel: true,
          checkpointType: true,
          checkpointSummary: true,
          lastError: true,
          pendingManualRecovery: true,
          startedAt: true,
          finishedAt: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.generationJob.findMany({
        where: { novelId },
        orderBy: { updatedAt: "desc" },
        take: RECENT_JOB_LIMIT,
        select: {
          id: true,
          status: true,
          progress: true,
          startOrder: true,
          endOrder: true,
          currentStage: true,
          currentItemLabel: true,
          error: true,
          pendingManualRecovery: true,
          startedAt: true,
          finishedAt: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.volumePlan.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          title: true,
          summary: true,
          status: true,
        },
      }),
      prisma.novelBible.findUnique({
        where: { novelId },
        select: {
          id: true,
          coreSetting: true,
          mainPromise: true,
          characterArcs: true,
          worldRules: true,
        },
      }),
      getNovelDrilldownOverview(novelId),
    ]);

  const chapterIdsWithBody = new Set(chaptersWithBody.map((row) => row.id));
  const chapters: WorkspaceChapterItem[] = chaptersRaw.map((chapter) => ({
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    generationState: String(chapter.generationState),
    chapterStatus: chapter.chapterStatus ? String(chapter.chapterStatus) : null,
    hasContent: chapterIdsWithBody.has(chapter.id),
    qualityScore: chapter.qualityScore,
    updatedAt: toIso(chapter.updatedAt),
  }));

  const characters: WorkspaceCharacterCard[] = charactersRaw.map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    castRole: character.castRole,
    gender: String(character.gender),
    identityLabel: character.identityLabel,
    factionLabel: character.factionLabel,
    personality: character.personality,
    firstImpression: character.firstImpression,
    appearance: character.appearance,
    signatureDetail: character.signatureDetail,
    currentState: character.currentState,
    currentGoal: character.currentGoal,
    relationToProtagonist: character.relationToProtagonist,
  }));

  const tasks: WorkspaceTaskItem[] = [
    ...workflowTasks.map((task) => ({
      kind: "workflow" as const,
      id: task.id,
      title: task.title,
      status: String(task.status),
      progress: task.progress,
      currentStage: task.currentStage,
      currentItemLabel: task.currentItemLabel,
      checkpointType: task.checkpointType,
      checkpointSummary: task.checkpointSummary,
      error: task.lastError,
      pendingManualRecovery: task.pendingManualRecovery,
      startedAt: toIso(task.startedAt),
      finishedAt: toIso(task.finishedAt),
      updatedAt: toIso(task.updatedAt),
      createdAt: toIso(task.createdAt),
    })),
    ...generationJobs.map((job) => ({
      kind: "generation" as const,
      id: job.id,
      title: `生成第 ${job.startOrder}–${job.endOrder} 章`,
      status: String(job.status),
      progress: job.progress,
      currentStage: job.currentStage,
      currentItemLabel: job.currentItemLabel,
      checkpointType: null,
      checkpointSummary: null,
      error: job.error,
      pendingManualRecovery: job.pendingManualRecovery,
      startedAt: toIso(job.startedAt),
      finishedAt: toIso(job.finishedAt),
      updatedAt: toIso(job.updatedAt),
      createdAt: toIso(job.createdAt),
    })),
  ].sort((left, right) => {
    const leftFailed = /fail|error|waiting_recovery/i.test(left.status) || left.pendingManualRecovery ? 1 : 0;
    const rightFailed = /fail|error|waiting_recovery/i.test(right.status) || right.pendingManualRecovery ? 1 : 0;
    if (leftFailed !== rightFailed) return rightFailed - leftFailed;
    return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
  });

  const isRunning = (task: WorkspaceTaskItem) => /^(queued|running)$/i.test(task.status);
  const needsAttention = (task: WorkspaceTaskItem) =>
    /fail|error|waiting_recovery|waiting_approval|blocked/i.test(task.status) || task.pendingManualRecovery;
  const pipeline: WorkspacePipelineSummary = {
    runningCount: tasks.filter(isRunning).length,
    failedOrRecoveryCount: tasks.filter(needsAttention).length,
    queuedCount: tasks.filter((task) => /^queued$/i.test(task.status)).length,
    latestRunning: tasks.filter(isRunning).slice(0, 5),
    attention: tasks.filter(needsAttention).slice(0, 5),
  };

  return {
    novel: {
      id: novel.id,
      title: novel.title,
      description: novel.description,
      status: novel.status,
      projectStatus: novel.projectStatus ? String(novel.projectStatus) : null,
      outlineStatus: novel.outlineStatus ? String(novel.outlineStatus) : null,
      storylineStatus: novel.storylineStatus ? String(novel.storylineStatus) : null,
      estimatedChapterCount: novel.estimatedChapterCount,
      defaultChapterLength: novel.defaultChapterLength,
      outlinePreview: truncate(novel.outline, OUTLINE_PREVIEW_CHARS),
      outline: novel.outline,
      structuredOutlinePreview: truncate(novel.structuredOutline, OUTLINE_PREVIEW_CHARS),
      updatedAt: toIso(novel.updatedAt),
    },
    chapters,
    characters,
    tasks,
    pipeline,
    volumes: volumes.map((volume) => ({
      id: volume.id,
      sortOrder: volume.sortOrder,
      title: volume.title,
      summary: volume.summary,
      status: volume.status,
    })),
    bible: bible
      ? {
          id: bible.id,
          coreSetting: bible.coreSetting,
          mainPromise: bible.mainPromise,
          characterArcs: bible.characterArcs,
          worldRules: bible.worldRules,
        }
      : null,
    structuredOutline: novel.structuredOutline,
    counts: {
      chapters: chapters.length,
      characters: characters.length,
      workflowTasks: workflowTasks.length,
      generationJobs: generationJobs.length,
      volumes: volumes.length,
      childModelCount: overview.childModelCount,
      totalRelatedRows: overview.totalRelatedRows,
    },
    children: overview.children,
  };
}

export async function getWorkspaceChapterDetail(
  novelId: string,
  chapterId: string,
): Promise<WorkspaceChapterDetail> {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
    select: {
      id: true,
      novelId: true,
      order: true,
      title: true,
      content: true,
      generationState: true,
      chapterStatus: true,
      targetWordCount: true,
      qualityScore: true,
      continuityScore: true,
      characterScore: true,
      pacingScore: true,
      hook: true,
      expectation: true,
      mustAvoid: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  if (!chapter) {
    throw new AppError("章节不存在或不属于该小说。", 404);
  }
  const content = chapter.content ?? "";
  return {
    id: chapter.id,
    novelId: chapter.novelId,
    order: chapter.order,
    title: chapter.title,
    content,
    generationState: String(chapter.generationState),
    chapterStatus: chapter.chapterStatus ? String(chapter.chapterStatus) : null,
    targetWordCount: chapter.targetWordCount,
    wordCount: countWords(content),
    qualityScore: chapter.qualityScore,
    continuityScore: chapter.continuityScore,
    characterScore: chapter.characterScore,
    pacingScore: chapter.pacingScore,
    hook: chapter.hook,
    expectation: chapter.expectation,
    mustAvoid: chapter.mustAvoid,
    updatedAt: toIso(chapter.updatedAt),
    createdAt: toIso(chapter.createdAt),
  };
}
