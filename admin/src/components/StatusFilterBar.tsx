import { getStatusPresets, type StatusPreset } from "@/lib/statusFilters";

interface StatusFilterBarProps {
  modelName: string;
  activePresetId: string;
  onChange: (preset: StatusPreset) => void;
}

export function StatusFilterBar(props: StatusFilterBarProps) {
  const presets = getStatusPresets(props.modelName);
  if (presets.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">状态</span>
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => props.onChange(preset)}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            props.activePresetId === preset.id
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-white hover:bg-muted"
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
