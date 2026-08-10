import LLMSelector from "@/components/common/LLMSelector";
import { cn } from "@/lib/utils";

interface MobileLLMHeaderBarProps {
  className?: string;
}

/** Mobile top-bar model switcher: uses cached provider models until refresh. */
export default function MobileLLMHeaderBar({ className }: MobileLLMHeaderBarProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <LLMSelector
        compact
        mobile
        showBadge={false}
        showHelperText={false}
        showRefreshModels
      />
    </div>
  );
}
