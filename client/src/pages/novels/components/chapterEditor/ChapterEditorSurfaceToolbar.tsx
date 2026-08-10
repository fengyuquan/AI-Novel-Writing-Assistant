import { Button } from "@/components/ui/button";
import type { ChapterEditorDisplayPrefs } from "./aids/writingAidsStorage";
import type { ChapterEditorSpeechStatus } from "./hooks/useChapterEditorSpeech";
import type { ChapterEditorSpeechPrefs } from "./aids/writingAidsStorage";

const FONT_SIZE_OPTIONS = [14, 15, 16, 18, 20] as const;
const LINE_HEIGHT_OPTIONS = [1.6, 1.8, 2, 2.2, 2.4] as const;
const PARAGRAPH_GAP_OPTIONS = [8, 12, 16, 20, 24, 32, 40] as const;
const RATE_OPTIONS = [
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 1.75, label: "1.75x" },
  { value: 2, label: "2x" },
] as const;

interface ChapterEditorSurfaceToolbarProps {
  helperText: string;
  displayPrefs: ChapterEditorDisplayPrefs;
  onDisplayPrefsChange: (prefs: ChapterEditorDisplayPrefs) => void;
  speechSupported: boolean;
  speechStatus: ChapterEditorSpeechStatus;
  speechPrefs: ChapterEditorSpeechPrefs;
  voiceOptions: SpeechSynthesisVoice[];
  onStartSpeech: () => void;
  onStopSpeech: () => void;
  onTogglePauseSpeech: () => void;
  onSpeechPrefsChange: (patch: Partial<ChapterEditorSpeechPrefs>) => void;
}

export default function ChapterEditorSurfaceToolbar(props: ChapterEditorSurfaceToolbarProps) {
  const {
    helperText,
    displayPrefs,
    onDisplayPrefsChange,
    speechSupported,
    speechStatus,
    speechPrefs,
    voiceOptions,
    onStartSpeech,
    onStopSpeech,
    onTogglePauseSpeech,
    onSpeechPrefsChange,
  } = props;

  const isActive = speechStatus !== "idle";

  return (
    <div className="shrink-0 space-y-2 border-b border-border/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">正文</div>
        <div className="truncate text-xs text-muted-foreground">{helperText}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span>字号</span>
          <select
            className="h-8 rounded-md border border-border/70 bg-background px-2 text-foreground"
            value={displayPrefs.fontSize}
            onChange={(event) => {
              onDisplayPrefsChange({
                ...displayPrefs,
                fontSize: Number(event.target.value),
              });
            }}
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span>行距</span>
          <select
            className="h-8 rounded-md border border-border/70 bg-background px-2 text-foreground"
            value={displayPrefs.lineHeight}
            onChange={(event) => {
              onDisplayPrefsChange({
                ...displayPrefs,
                lineHeight: Number(event.target.value),
              });
            }}
          >
            {LINE_HEIGHT_OPTIONS.map((value) => (
              <option key={value} value={value}>{value.toFixed(1)}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span>段距</span>
          <select
            className="h-8 rounded-md border border-border/70 bg-background px-2 text-foreground"
            value={displayPrefs.paragraphGap}
            onChange={(event) => {
              onDisplayPrefsChange({
                ...displayPrefs,
                paragraphGap: Number(event.target.value),
              });
            }}
          >
            {PARAGRAPH_GAP_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}px</option>
            ))}
          </select>
        </label>

        <div className="mx-1 hidden h-5 w-px bg-border/70 sm:block" />

        {speechSupported ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                if (isActive) {
                  onTogglePauseSpeech();
                  return;
                }
                onStartSpeech();
              }}
            >
              {speechStatus === "playing"
                ? "暂停"
                : speechStatus === "paused"
                  ? "继续"
                  : "从此处朗读"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!isActive}
              onClick={onStopSpeech}
            >
              停止
            </Button>

            <label className="flex items-center gap-1.5 text-muted-foreground">
              <span>倍速</span>
              <select
                className="h-8 rounded-md border border-border/70 bg-background px-2 text-foreground"
                value={speechPrefs.rate}
                onChange={(event) => {
                  onSpeechPrefsChange({ rate: Number(event.target.value) });
                }}
              >
                {RATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="shrink-0">人声</span>
              <select
                className="h-8 max-w-[10rem] truncate rounded-md border border-border/70 bg-background px-2 text-foreground sm:max-w-[14rem]"
                value={speechPrefs.voiceURI}
                onChange={(event) => {
                  onSpeechPrefsChange({ voiceURI: event.target.value });
                }}
              >
                <option value="">系统默认</option>
                {voiceOptions.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>

            {isActive ? (
              <span className="text-muted-foreground">空格暂停 · ↑↓跳段</span>
            ) : (
              <span className="text-muted-foreground">从光标所在段读到章末</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">当前浏览器不支持朗读</span>
        )}
      </div>
    </div>
  );
}
