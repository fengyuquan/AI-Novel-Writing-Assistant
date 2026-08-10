const PREFIX = "chapter-editor-aids:";

function key(chapterId: string, suffix: string): string {
  return `${PREFIX}${chapterId}:${suffix}`;
}

function readJson<T>(storageKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export type SelfChecklistState = Record<string, boolean>;
export type CheckpointManualState = Record<"open" | "mid" | "end", boolean>;

export function loadSelfChecklist(chapterId: string): SelfChecklistState {
  return readJson(key(chapterId, "self-checklist"), {});
}

export function saveSelfChecklist(chapterId: string, state: SelfChecklistState): void {
  writeJson(key(chapterId, "self-checklist"), state);
}

export function loadCheckpointManual(chapterId: string): CheckpointManualState {
  return readJson(key(chapterId, "checkpoints"), {
    open: false,
    mid: false,
    end: false,
  });
}

export function saveCheckpointManual(chapterId: string, state: CheckpointManualState): void {
  writeJson(key(chapterId, "checkpoints"), state);
}

export type ChapterEditorDisplayPrefs = {
  fontSize: number;
  lineHeight: number;
  /** Space between paragraphs in pixels. */
  paragraphGap: number;
};

export type ChapterEditorSpeechPrefs = {
  rate: number;
  voiceURI: string;
};

const DISPLAY_PREFS_KEY = `${PREFIX}display-prefs`;
const SPEECH_PREFS_KEY = `${PREFIX}speech-prefs`;

const DEFAULT_DISPLAY_PREFS: ChapterEditorDisplayPrefs = {
  fontSize: 15,
  lineHeight: 2,
  paragraphGap: 16,
};

const DEFAULT_SPEECH_PREFS: ChapterEditorSpeechPrefs = {
  rate: 1,
  voiceURI: "",
};

export function loadDisplayPrefs(): ChapterEditorDisplayPrefs {
  const stored = readJson<Partial<ChapterEditorDisplayPrefs>>(DISPLAY_PREFS_KEY, {});
  const fontSize = typeof stored.fontSize === "number" ? stored.fontSize : DEFAULT_DISPLAY_PREFS.fontSize;
  const lineHeight = typeof stored.lineHeight === "number" ? stored.lineHeight : DEFAULT_DISPLAY_PREFS.lineHeight;
  const rawParagraphGap = typeof stored.paragraphGap === "number"
    ? stored.paragraphGap
    : Math.round(fontSize * lineHeight * 0.55);
  const paragraphGapChoices = [8, 12, 16, 20, 24, 32, 40];
  const paragraphGap = paragraphGapChoices.reduce((best, current) => (
    Math.abs(current - rawParagraphGap) < Math.abs(best - rawParagraphGap) ? current : best
  ), paragraphGapChoices[2]!);
  return {
    fontSize: Math.min(22, Math.max(13, fontSize)),
    lineHeight: Math.min(2.6, Math.max(1.4, lineHeight)),
    paragraphGap,
  };
}

export function saveDisplayPrefs(prefs: ChapterEditorDisplayPrefs): void {
  writeJson(DISPLAY_PREFS_KEY, prefs);
}

export function loadSpeechPrefs(): ChapterEditorSpeechPrefs {
  const stored = readJson<Partial<ChapterEditorSpeechPrefs>>(SPEECH_PREFS_KEY, {});
  const rate = typeof stored.rate === "number" ? stored.rate : DEFAULT_SPEECH_PREFS.rate;
  return {
    rate: Math.min(2, Math.max(0.5, rate)),
    voiceURI: typeof stored.voiceURI === "string" ? stored.voiceURI : "",
  };
}

export function saveSpeechPrefs(prefs: ChapterEditorSpeechPrefs): void {
  writeJson(SPEECH_PREFS_KEY, prefs);
}
