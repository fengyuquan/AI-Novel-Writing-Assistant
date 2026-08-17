/**
 * 漫画项目整包导入/导出契约。
 * 用于备份、换机恢复、项目分享；与「话级长图导出」「内容源 SourceBundle 导入」不同。
 */

export const COMIC_PROJECT_TRANSFER_KIND = "comic-project-transfer" as const;

export const COMIC_PROJECT_TRANSFER_SCHEMA_VERSION = 1 as const;

export type ComicProjectTransferSchemaVersion = typeof COMIC_PROJECT_TRANSFER_SCHEMA_VERSION;

export interface ComicProjectTransferFile {
  /** 相对逻辑路径，如 character/{id}/character-sheet.png */
  path: string;
  mimeType: string;
  /** base64（无 data: 前缀） */
  base64: string;
  byteLength: number;
}

export interface ComicProjectTransferMeta {
  includeImages: boolean;
  fileCount: number;
  totalFileBytes: number;
  omittedFileCount: number;
  warnings: string[];
}

export interface ComicProjectTransferEpisode {
  id: string;
  order: number;
  title: string | null;
  hookType: string | null;
  cliffhanger: string | null;
  isPaywalled: boolean;
  outline: string | null;
  sourceText: string | null;
  status: string;
  scriptConfig: string | null;
  panels: ComicProjectTransferPanel[];
}

export interface ComicProjectTransferPanel {
  id: string;
  order: number;
  panelType: string | null;
  action: string;
  dialogues: string | null;
  characterRefs: string | null;
  sceneRef: string | null;
  visualPrompt: string | null;
  densityLevel: string | null;
  focus: string | null;
  layoutData: string | null;
  imageData: string | null;
  letteredData: string | null;
  motionData: string | null;
}

export interface ComicProjectTransferPackage {
  kind: typeof COMIC_PROJECT_TRANSFER_KIND;
  schemaVersion: ComicProjectTransferSchemaVersion;
  exportedAt: string;
  sourceProjectId: string;
  project: {
    title: string;
    sourceType: string;
    sourceRef: string | null;
    sourceInput: string | null;
    trackId: string | null;
    stylePreset: string | null;
    status: string;
  };
  sourceBundle: { bundleJson: string } | null;
  characters: Array<{
    id: string;
    name: string;
    gender: string;
    persona: string | null;
    visualAnchor: string | null;
    sheetData: string | null;
    sourceCharacterRef: string | null;
  }>;
  characterAssets: Array<{
    id: string;
    characterId: string;
    assetType: string;
    name: string;
    description: string | null;
    imageData: string | null;
    sortOrder: number;
  }>;
  scenes: Array<{
    id: string;
    name: string;
    sceneType: string;
    bible: string | null;
    sheetData: string | null;
    sortOrder: number;
  }>;
  episodes: ComicProjectTransferEpisode[];
  facts: Array<{
    id: string;
    text: string;
    category: string;
    episodeOrder: number | null;
  }>;
  files: ComicProjectTransferFile[];
  meta: ComicProjectTransferMeta;
}

export interface ComicProjectTransferPreview {
  schemaVersion: number;
  exportedAt: string | null;
  sourceProjectId: string | null;
  title: string;
  sourceType: string | null;
  counts: {
    characters: number;
    characterAssets: number;
    scenes: number;
    episodes: number;
    panels: number;
    facts: number;
    files: number;
  };
  includeImages: boolean;
  warnings: string[];
  canImport: boolean;
}

export interface ComicProjectTransferImportResult {
  projectId: string;
  title: string;
  preview: ComicProjectTransferPreview;
  restoredFiles: number;
  skippedFiles: number;
}
