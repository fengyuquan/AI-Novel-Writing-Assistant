import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import { toast } from "@/components/ui/toast";
import type { ChapterEditorDiffChunk } from "@ai-novel/shared/types/novel";
import ChapterEditorSurfaceToolbar from "./ChapterEditorSurfaceToolbar";
import type { ChapterEditorSelectionRange, SelectionToolbarPosition } from "./chapterEditorTypes";
import {
  buildSelectionRangeFromValue,
  buildToolbarPosition,
  getCaretOffsetFromValue,
  getParagraphIndicesForRange,
  normalizeChapterContent,
  normalizeEditorText,
  normalizeValuePayload,
  toPlainText,
  toPlateValue,
} from "./chapterEditorUtils";
import {
  loadDisplayPrefs,
  saveDisplayPrefs,
  type ChapterEditorDisplayPrefs,
} from "./aids/writingAidsStorage";
import { useChapterEditorSpeech } from "./hooks/useChapterEditorSpeech";

type ChapterEditorPreview =
  | {
    mode: "loading";
    from: number;
    to: number;
    originalText: string;
  }
  | {
    mode: "inline";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    originalText: string;
    candidateText: string;
  }
  | {
    mode: "block";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    originalText: string;
    candidateText: string;
  };

interface ChapterTextEditorProps {
  value: string;
  readOnly?: boolean;
  /** When false, content grows with the page (mobile). When true, fills parent and scrolls inside. */
  fillHeight?: boolean;
  selection?: ChapterEditorSelectionRange | null;
  onChange: (next: string) => void;
  onSelectionChange: (selection: ChapterEditorSelectionRange | null, position: SelectionToolbarPosition | null) => void;
  preview?: ChapterEditorPreview | null;
  focusRange?: Pick<ChapterEditorSelectionRange, "from" | "to"> | null;
  /** When true, omit outer card chrome so parent can own border/status bar. */
  embedded?: boolean;
}

/** Plate ParagraphPlugin renders blocks as div.slate-p, not native <p>. */
const PARAGRAPH_NODE_SELECTOR = ":scope > .slate-p, :scope > p";
const EDITOR_BODY_CLASS_NAME = "prose prose-sm max-w-none min-w-0 overflow-hidden break-words dark:prose-invert [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_.slate-p]:my-0 [&_.slate-p:last-child]:mb-0 [&_p]:my-0 [&_p:last-child]:mb-0";
const INLINE_PREVIEW_BODY_CLASS_NAME = `${EDITOR_BODY_CLASS_NAME} whitespace-pre-wrap`;
const READONLY_BODY_CLASS_NAME = "min-w-0 break-words";
const SURFACE_INNER_PADDING_CLASS_NAME = "pl-14";
const PARAGRAPH_GAP_CLASS_NAME = "[&_.slate-p]:mb-[var(--editor-paragraph-gap)] [&_p]:mb-[var(--editor-paragraph-gap)]";
const FOCUS_PARAGRAPH_CLASSES = ["bg-sky-100/90", "ring-1", "ring-sky-200", "rounded-xl"] as const;
const SPEAKING_PARAGRAPH_CLASSES = ["bg-amber-100/90", "ring-1", "ring-amber-200", "rounded-xl"] as const;

function buildEditorSurfaceStyle(prefs: ChapterEditorDisplayPrefs): CSSProperties {
  return {
    fontSize: `${prefs.fontSize}px`,
    lineHeight: String(prefs.lineHeight),
    ["--editor-paragraph-gap" as string]: `${prefs.paragraphGap}px`,
  };
}

function splitDisplayParagraphs(text: string): string[] {
  const normalized = normalizeChapterContent(text);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function TextBlock(props: { text: string; className?: string; style?: CSSProperties }) {
  const { text, className, style } = props;
  const paragraphs = splitDisplayParagraphs(text);
  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className={`${READONLY_BODY_CLASS_NAME} ${className ?? ""}`.trim()} style={style}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 16)}`} className="mb-[var(--editor-paragraph-gap)] last:mb-0">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function getParagraphElements(surface: HTMLDivElement): HTMLElement[] {
  const richTextRoot = surface.querySelector('[contenteditable="true"]') as HTMLDivElement | null;
  const searchRoot = richTextRoot ?? surface;
  const directBlocks = Array.from(searchRoot.querySelectorAll<HTMLElement>(PARAGRAPH_NODE_SELECTOR));
  if (directBlocks.length > 0) {
    return directBlocks.filter((node) => Boolean(node.textContent?.trim()) || directBlocks.length === 1);
  }

  // Fallback for preview/readonly surfaces that nest paragraph nodes.
  return Array.from(searchRoot.querySelectorAll<HTMLElement>(".slate-p, p")).filter(
    (node) => Boolean(node.textContent?.trim()) && !node.querySelector(".slate-p, p"),
  );
}

function renderDiffChunk(chunk: ChapterEditorDiffChunk) {
  if (chunk.type === "equal") {
    return <span key={chunk.id}>{chunk.text}</span>;
  }
  if (chunk.type === "insert") {
    return (
      <span key={chunk.id} className="rounded bg-emerald-100/90 px-0.5 text-emerald-950">
        {chunk.text}
      </span>
    );
  }
  return (
    <span key={chunk.id} className="rounded bg-rose-100/80 px-0.5 text-rose-900 line-through">
      {chunk.text}
    </span>
  );
}

function renderLoadingPreview(
  preview: Extract<ChapterEditorPreview, { mode: "loading" }>,
  previewContent: { before: string; after: string },
  surfaceRef: React.RefObject<HTMLDivElement | null>,
) {
  return (
    <div ref={surfaceRef} className={`space-y-4 rounded-2xl bg-muted/10 p-4 ${SURFACE_INNER_PADDING_CLASS_NAME}`}>
      <TextBlock text={previewContent.before} className="text-foreground" />

      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
          <div className="mb-2 text-xs font-medium text-amber-700">待改写原文</div>
          <TextBlock text={preview.originalText} className="text-amber-950" />
        </div>
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 p-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">AI 正在生成候选版本</div>
          <div className="space-y-2">
            <div className="h-4 w-11/12 rounded-full bg-muted/70" />
            <div className="h-4 w-full rounded-full bg-muted/60" />
            <div className="h-4 w-4/5 rounded-full bg-muted/50" />
          </div>
        </div>
      </div>

      <TextBlock text={previewContent.after} className="text-foreground" />
    </div>
  );
}

function renderBlockPreview(
  preview: Extract<ChapterEditorPreview, { mode: "block" }>,
  previewContent: { before: string; after: string },
  surfaceRef: React.RefObject<HTMLDivElement | null>,
) {
  return (
    <div ref={surfaceRef} className={`space-y-4 rounded-2xl bg-muted/10 p-4 ${SURFACE_INNER_PADDING_CLASS_NAME}`}>
      <TextBlock text={previewContent.before} className="text-foreground" />

      <div className="space-y-3">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-4">
          <div className="mb-2 text-xs font-medium text-rose-700">原文</div>
          <TextBlock text={preview.originalText} className="text-rose-950" />
        </div>
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4">
          <div className="mb-2 text-xs font-medium text-emerald-700">改写</div>
          <TextBlock text={preview.candidateText} className="text-emerald-950" />
        </div>
      </div>

      <TextBlock text={previewContent.after} className="text-foreground" />
    </div>
  );
}

export default function ChapterTextEditor(props: ChapterTextEditorProps) {
  const {
    value,
    readOnly = false,
    fillHeight = true,
    selection = null,
    onChange,
    onSelectionChange,
    preview,
    focusRange = null,
  } = props;
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(() => normalizeChapterContent(value));
  const [displayPrefs, setDisplayPrefs] = useState<ChapterEditorDisplayPrefs>(() => loadDisplayPrefs());
  const [caretOffset, setCaretOffset] = useState<number | null>(null);
  const [paragraphMarkerOffsets, setParagraphMarkerOffsets] = useState<Array<{ index: number; top: number }>>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const isUserEditingRef = useRef(false);
  const surfaceStyle = useMemo(() => buildEditorSurfaceStyle(displayPrefs), [displayPrefs]);
  const speech = useChapterEditorSpeech({
    content: value,
    selection,
    caretOffset,
  });

  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin],
      value: toPlateValue(internalText),
    },
    [editorSeed],
  );

  useEffect(() => {
    const nextValue = normalizeChapterContent(value);
    if (nextValue === internalText) {
      return;
    }
    setInternalText(nextValue);
    setEditorSeed((current) => current + 1);
  }, [internalText, value]);

  useEffect(() => {
    if (preview || readOnly) {
      onSelectionChange(null, null);
    }
  }, [onSelectionChange, preview, readOnly]);

  const updateSelection = useCallback(() => {
    if (!editor || preview || readOnly) {
      setCaretOffset(null);
      onSelectionChange(null, null);
      return;
    }

    const editorSelection = editor.selection as {
      anchor: { path: number[]; offset: number };
      focus: { path: number[]; offset: number };
    } | null;
    const nextCaret = getCaretOffsetFromValue(editor.children as Value, editorSelection);
    setCaretOffset(nextCaret);

    const selectionObject = globalThis.window?.getSelection?.();
    const surface = surfaceRef.current;
    if (!selectionObject || !surface || selectionObject.rangeCount === 0 || selectionObject.isCollapsed) {
      onSelectionChange(null, null);
      return;
    }

    const range = selectionObject.getRangeAt(0);
    if (!surface.contains(range.commonAncestorContainer)) {
      onSelectionChange(null, null);
      return;
    }

    const selectionRange = buildSelectionRangeFromValue(editor.children as Value, editorSelection);
    if (!selectionRange) {
      onSelectionChange(null, null);
      return;
    }

    const container = containerRef.current;
    const position = container ? buildToolbarPosition(container, range) : null;

    onSelectionChange(selectionRange, position);
  }, [editor, onSelectionChange, preview, readOnly]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = normalizeEditorText(toPlainText(normalizeValuePayload(payload)));
    if (!isUserEditingRef.current || nextText === internalText) {
      return;
    }
    setInternalText(nextText);
    onChange(nextText);
  }, [internalText, onChange]);

  const normalizedContent = useMemo(() => normalizeChapterContent(value), [value]);

  const previewContent = useMemo(() => {
    if (!preview) {
      return null;
    }
    return {
      before: normalizedContent.slice(0, preview.from),
      after: normalizedContent.slice(preview.to),
    };
  }, [normalizedContent, preview]);

  const highlightedParagraphRange = useMemo(
    () => (focusRange ? getParagraphIndicesForRange(normalizedContent, focusRange) : null),
    [focusRange, normalizedContent],
  );

  const helperText = preview?.mode === "inline"
    ? "当前正在显示细节标记 diff，适合确认具体删改。"
    : preview?.mode === "loading"
      ? "AI 正在基于选中内容生成候选版本，原文位置会持续保留。"
      : preview?.mode === "block"
        ? "当前正在显示段落 patch 对比，原文和改写会在正文原位置并排落成红绿块。"
        : readOnly
          ? "当前有待确认候选，正文暂时锁定，可在右侧切换候选或接受、拒绝。"
      : "可直接编辑正文，选中内容后可发起 AI 改写。";

  const handleDisplayPrefsChange = (next: ChapterEditorDisplayPrefs) => {
    setDisplayPrefs(next);
    saveDisplayPrefs(next);
  };

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || preview) {
      return;
    }
    const paragraphNodes = getParagraphElements(surface);
    paragraphNodes.forEach((node) => {
      node.classList.remove(...FOCUS_PARAGRAPH_CLASSES, ...SPEAKING_PARAGRAPH_CLASSES);
    });

    if (highlightedParagraphRange) {
      for (let index = highlightedParagraphRange.startIndex; index <= highlightedParagraphRange.endIndex; index += 1) {
        paragraphNodes[index]?.classList.add(...FOCUS_PARAGRAPH_CLASSES);
      }
      paragraphNodes[highlightedParagraphRange.startIndex]?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }

    if (speech.speakingParagraphIndex != null) {
      const speakingNode = paragraphNodes[speech.speakingParagraphIndex];
      speakingNode?.classList.remove(...FOCUS_PARAGRAPH_CLASSES);
      speakingNode?.classList.add(...SPEAKING_PARAGRAPH_CLASSES);
      speakingNode?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [highlightedParagraphRange, preview, speech.speakingParagraphIndex]);

  const updateParagraphMarkers = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      setParagraphMarkerOffsets([]);
      return;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const paragraphNodes = getParagraphElements(surface);
    const nextOffsets = paragraphNodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        index,
        top: rect.top - surfaceRect.top + rect.height / 2,
      };
    });

    setParagraphMarkerOffsets((current) => {
      if (
        current.length === nextOffsets.length
        && current.every((item, index) => item.index === nextOffsets[index]?.index && Math.abs(item.top - nextOffsets[index]!.top) < 1)
      ) {
        return current;
      }
      return nextOffsets;
    });
  }, []);

  useLayoutEffect(() => {
    if (!fillHeight) {
      setParagraphMarkerOffsets([]);
      return;
    }
    updateParagraphMarkers();

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateParagraphMarkers();
    });

    resizeObserver.observe(surface);
    getParagraphElements(surface).forEach((node) => resizeObserver.observe(node));

    return () => {
      resizeObserver.disconnect();
    };
  }, [editorSeed, fillHeight, normalizedContent, preview, readOnly, updateParagraphMarkers]);

  const paragraphMarkers = fillHeight && paragraphMarkerOffsets.length > 0 ? (
    <div className="pointer-events-none absolute inset-y-0 left-0 top-0 z-10 w-12">
      {paragraphMarkerOffsets.map((marker) => {
        const isSpeaking = speech.speakingParagraphIndex === marker.index;
        const isHighlighted = highlightedParagraphRange
          ? marker.index >= highlightedParagraphRange.startIndex && marker.index <= highlightedParagraphRange.endIndex
          : false;
        return (
          <div
            key={`marker:${marker.index}`}
            className={`absolute left-0 flex w-12 justify-end pr-3 text-[11px] font-semibold ${
              isSpeaking ? "text-amber-700" : isHighlighted ? "text-sky-700" : "text-muted-foreground"
            }`}
            style={{ top: `${marker.top}px`, transform: "translateY(-50%)" }}
          >
            P{marker.index + 1}
          </div>
        );
      })}
    </div>
  ) : null;

  const surfacePaddingClassName = fillHeight ? SURFACE_INNER_PADDING_CLASS_NAME : "pl-0";
  const bodyClassName = `${EDITOR_BODY_CLASS_NAME} ${PARAGRAPH_GAP_CLASS_NAME} ${surfacePaddingClassName} ${
    fillHeight ? "min-h-full rounded-2xl bg-muted/10 p-4" : "min-h-[50vh] rounded-2xl bg-muted/10 p-3 sm:p-4"
  }`;

  const shellClassName = !fillHeight
    ? props.embedded
      ? "relative flex w-full min-w-0 min-h-[60vh] flex-col overflow-x-hidden"
      : "relative flex w-full min-w-0 min-h-[60vh] flex-col overflow-x-hidden rounded-2xl border border-border/70 bg-background"
    : props.embedded
      ? "relative flex h-full min-h-0 flex-col overflow-hidden"
      : "relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm";

  return (
    <div ref={containerRef} className={shellClassName}>
      <ChapterEditorSurfaceToolbar
        helperText={helperText}
        displayPrefs={displayPrefs}
        onDisplayPrefsChange={handleDisplayPrefsChange}
        speechSupported={speech.supported}
        speechStatus={speech.status}
        speechPrefs={speech.prefs}
        voiceOptions={speech.voiceOptions}
        onStartSpeech={() => {
          if (!speech.start()) {
            toast.error("没有可朗读的正文。");
          }
        }}
        onStopSpeech={speech.stop}
        onTogglePauseSpeech={speech.togglePause}
        onSpeechPrefsChange={speech.updatePrefs}
      />

      <div
        className={fillHeight ? "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" : "p-3 sm:p-4"}
        data-chapter-editor-scroll={fillHeight ? "true" : undefined}
      >
        <div className={fillHeight ? "relative min-h-full" : "relative min-w-0"}>
          {preview?.mode === "inline" && previewContent ? (
            <div
              ref={surfaceRef}
              className={`${INLINE_PREVIEW_BODY_CLASS_NAME} ${PARAGRAPH_GAP_CLASS_NAME} ${surfacePaddingClassName} min-h-full rounded-2xl bg-muted/15 p-4 text-foreground`}
              style={surfaceStyle}
            >
              {previewContent.before}
              {preview.diffChunks.map((chunk) => renderDiffChunk(chunk))}
              {previewContent.after}
            </div>
          ) : preview?.mode === "loading" && previewContent ? (
            renderLoadingPreview(preview, previewContent, surfaceRef)
          ) : preview?.mode === "block" && previewContent ? (
            renderBlockPreview(preview, previewContent, surfaceRef)
          ) : readOnly ? (
            <div
              ref={surfaceRef}
              className={`min-h-full rounded-2xl bg-muted/10 p-4 text-foreground ${surfacePaddingClassName}`}
              style={surfaceStyle}
            >
              <TextBlock text={normalizedContent} style={surfaceStyle} />
            </div>
          ) : editor ? (
            <Plate editor={editor} onSelectionChange={updateSelection} onValueChange={handleValueChange}>
              <div ref={surfaceRef} className="min-h-full min-w-0">
                <PlateContent
                  className={`${bodyClassName} outline-none [&_.slate-p]:text-foreground [&_p]:text-foreground`}
                  style={surfaceStyle}
                  onFocus={() => {
                    isUserEditingRef.current = true;
                  }}
                  onBlur={() => {
                    isUserEditingRef.current = false;
                  }}
                  onMouseUp={updateSelection}
                  onKeyUp={updateSelection}
                />
              </div>
            </Plate>
          ) : null}

          {paragraphMarkers}
        </div>
      </div>
    </div>
  );
}
