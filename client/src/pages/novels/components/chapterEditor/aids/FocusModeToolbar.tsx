import { Button } from "@/components/ui/button";

interface FocusModeToolbarProps {
  enabled: boolean;
  wordCount: number;
  saveStatusLabel: string;
  syncStatusLabel: string;
  isDirty: boolean;
  needsSync: boolean;
  isSaving: boolean;
  isSyncing: boolean;
  onToggle: () => void;
  onSave: () => void;
  onSyncSave: () => void;
}

export default function FocusModeToolbar(props: FocusModeToolbarProps) {
  const {
    enabled,
    wordCount,
    saveStatusLabel,
    syncStatusLabel,
    isDirty,
    needsSync,
    isSaving,
    isSyncing,
    onToggle,
    onSave,
    onSyncSave,
  } = props;

  if (!enabled) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          需要专心写正文时，可打开专注模式，只保留正文和必要操作。
        </div>
        <Button size="sm" variant="outline" onClick={onToggle}>
          专注模式
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background px-3 py-2 shadow-sm">
      <div className="text-sm text-muted-foreground">
        专注模式 · {wordCount} 字 · {saveStatusLabel} · {syncStatusLabel}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onSave} disabled={!isDirty || isSaving || isSyncing}>
          {isSaving ? "保存中..." : "保存"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onSyncSave}
          disabled={(!isDirty && !needsSync) || isSaving || isSyncing}
        >
          {isSyncing ? "同步中..." : "同步保存"}
        </Button>
        <Button size="sm" variant="outline" onClick={onToggle}>
          退出专注
        </Button>
      </div>
    </div>
  );
}
