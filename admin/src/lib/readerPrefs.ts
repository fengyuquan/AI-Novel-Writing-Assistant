export type ReaderTheme = "paper" | "night";

export interface ReaderPrefs {
  fontSize: number;
  maxWidthRem: number;
  theme: ReaderTheme;
}

const STORAGE_KEY = "ai-novel-admin-reader-prefs";

const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 17,
  maxWidthRem: 42,
  theme: "paper",
};

export function loadReaderPrefs(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      fontSize: clamp(Number(parsed.fontSize) || DEFAULT_PREFS.fontSize, 14, 24),
      maxWidthRem: clamp(Number(parsed.maxWidthRem) || DEFAULT_PREFS.maxWidthRem, 32, 56),
      theme: parsed.theme === "night" ? "night" : "paper",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveReaderPrefs(prefs: ReaderPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
