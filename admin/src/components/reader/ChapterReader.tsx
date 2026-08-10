import { useEffect, useState } from "react";
import { loadReaderPrefs, saveReaderPrefs, type ReaderPrefs } from "@/lib/readerPrefs";

interface ChapterReaderProps {
  title: string;
  order?: number;
  content: string;
  meta?: string | null;
  showControls?: boolean;
}

function splitParagraphs(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n{2,}|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ChapterReader(props: ChapterReaderProps) {
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => loadReaderPrefs());
  const paragraphs = splitParagraphs(props.content);
  const night = prefs.theme === "night";

  useEffect(() => {
    saveReaderPrefs(prefs);
  }, [prefs]);

  function patch(partial: Partial<ReaderPrefs>) {
    setPrefs((prev) => ({ ...prev, ...partial }));
  }

  return (
    <div>
      {props.showControls !== false ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">阅读偏好</span>
          <button
            type="button"
            className="rounded border bg-white px-2 py-1"
            onClick={() => patch({ fontSize: Math.max(14, prefs.fontSize - 1) })}
          >
            A-
          </button>
          <button
            type="button"
            className="rounded border bg-white px-2 py-1"
            onClick={() => patch({ fontSize: Math.min(24, prefs.fontSize + 1) })}
          >
            A+
          </button>
          <button
            type="button"
            className="rounded border bg-white px-2 py-1"
            onClick={() => patch({ maxWidthRem: Math.max(32, prefs.maxWidthRem - 2) })}
          >
            窄
          </button>
          <button
            type="button"
            className="rounded border bg-white px-2 py-1"
            onClick={() => patch({ maxWidthRem: Math.min(56, prefs.maxWidthRem + 2) })}
          >
            宽
          </button>
          <button
            type="button"
            className="rounded border bg-white px-2 py-1"
            onClick={() => patch({ theme: night ? "paper" : "night" })}
          >
            {night ? "纸色" : "夜间"}
          </button>
          <span className="text-muted-foreground">
            {prefs.fontSize}px · {prefs.maxWidthRem}rem
          </span>
        </div>
      ) : null}

      <article
        className="reader-prose min-h-full rounded-lg border border-border/70 px-6 py-8 sm:px-10 sm:py-10"
        data-theme={prefs.theme}
        style={{
          fontSize: `${prefs.fontSize}px`,
          maxWidth: `${prefs.maxWidthRem}rem`,
          marginInline: "auto",
          background: night ? "hsl(220 18% 12%)" : "hsl(var(--reader-bg))",
          color: night ? "hsl(210 20% 90%)" : "hsl(var(--reader-ink))",
          borderColor: night ? "hsl(220 14% 22%)" : undefined,
        }}
      >
        <header className="mb-8 border-b border-border/60 pb-5" style={{ borderColor: night ? "hsl(220 14% 24%)" : undefined }}>
          {typeof props.order === "number" ? (
            <div className="mb-2 text-xs tracking-wide opacity-70">第 {props.order} 章</div>
          ) : null}
          <h1 className="font-semibold tracking-tight" style={{ fontSize: "1.45em", lineHeight: 1.35 }}>
            {props.title}
          </h1>
          {props.meta ? <p className="mt-2 text-xs opacity-70">{props.meta}</p> : null}
        </header>
        {paragraphs.length === 0 ? (
          <p className="opacity-70" style={{ textIndent: 0 }}>
            本章暂无正文。
          </p>
        ) : (
          paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)
        )}
      </article>
    </div>
  );
}
