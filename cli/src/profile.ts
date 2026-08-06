import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface OutlineFirstProfile {
  /** 是否默认走大纲优先开书 */
  preferOutlineFirst: boolean;
  /** 期望总章数 */
  estimatedChapterCount: number;
  /** 每章默认字数下限（写入 defaultChapterLength） */
  minChapterWords: number;
  updatedAt?: string;
}

export interface CliProfile {
  outlineFirst: OutlineFirstProfile;
}

export const DEFAULT_OUTLINE_FIRST_PROFILE: OutlineFirstProfile = {
  preferOutlineFirst: true,
  estimatedChapterCount: 800,
  minChapterWords: 3000,
};

const PROFILE_DIR = path.join(os.homedir(), ".ai-novel-writing-assistant");
const PROFILE_PATH = path.join(PROFILE_DIR, "cli-profile.json");

export function getCliProfilePath(): string {
  return PROFILE_PATH;
}

export function loadCliProfile(): CliProfile {
  try {
    if (!fs.existsSync(PROFILE_PATH)) {
      return { outlineFirst: { ...DEFAULT_OUTLINE_FIRST_PROFILE } };
    }
    const raw = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")) as Partial<CliProfile>;
    return {
      outlineFirst: normalizeOutlineFirst(raw.outlineFirst),
    };
  } catch {
    return { outlineFirst: { ...DEFAULT_OUTLINE_FIRST_PROFILE } };
  }
}

export function saveCliProfile(profile: CliProfile): void {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const next: CliProfile = {
    outlineFirst: {
      ...normalizeOutlineFirst(profile.outlineFirst),
      updatedAt: new Date().toISOString(),
    },
  };
  fs.writeFileSync(PROFILE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function updateOutlineFirstProfile(
  patch: Partial<OutlineFirstProfile>,
): OutlineFirstProfile {
  const current = loadCliProfile();
  const outlineFirst = normalizeOutlineFirst({
    ...current.outlineFirst,
    ...patch,
  });
  saveCliProfile({ outlineFirst });
  return outlineFirst;
}

function normalizeOutlineFirst(input?: Partial<OutlineFirstProfile> | null): OutlineFirstProfile {
  const estimatedChapterCount = clampInt(
    input?.estimatedChapterCount,
    DEFAULT_OUTLINE_FIRST_PROFILE.estimatedChapterCount,
    12,
    2000,
  );
  const minChapterWords = clampInt(
    input?.minChapterWords,
    DEFAULT_OUTLINE_FIRST_PROFILE.minChapterWords,
    500,
    20000,
  );
  return {
    preferOutlineFirst: input?.preferOutlineFirst ?? DEFAULT_OUTLINE_FIRST_PROFILE.preferOutlineFirst,
    estimatedChapterCount,
    minChapterWords,
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : undefined,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(num)));
}
