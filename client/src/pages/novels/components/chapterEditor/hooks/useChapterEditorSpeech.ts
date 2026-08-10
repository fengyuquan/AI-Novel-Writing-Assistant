import { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterEditorSelectionRange } from "../chapterEditorTypes";
import { getParagraphIndicesForRange, normalizeChapterContent } from "../chapterEditorUtils";
import {
  loadSpeechPrefs,
  saveSpeechPrefs,
  type ChapterEditorSpeechPrefs,
} from "../aids/writingAidsStorage";

export type ChapterEditorSpeechStatus = "idle" | "playing" | "paused";

type SpeakPlan = {
  chunks: string[];
  baseParagraphIndex: number;
};

function splitParagraphs(content: string): string[] {
  const normalized = normalizeChapterContent(content);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
}

function findParagraphIndexAtOffset(content: string, offset: number): number | null {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) {
    return null;
  }

  let cursor = 0;
  for (let index = 0; index < paragraphs.length; index += 1) {
    const end = cursor + (paragraphs[index]?.length ?? 0);
    if (offset <= end || index === paragraphs.length - 1) {
      return index;
    }
    cursor = end + 2;
  }
  return paragraphs.length - 1;
}

function resolveStartParagraphIndex(
  content: string,
  selection: ChapterEditorSelectionRange | null,
  caretOffset: number | null,
): number {
  const normalized = normalizeChapterContent(content);
  const paragraphs = splitParagraphs(normalized);
  if (paragraphs.length === 0) {
    return 0;
  }

  if (selection?.text?.trim()) {
    const indices = getParagraphIndicesForRange(normalized, selection);
    if (indices) {
      return indices.startIndex;
    }
  }

  if (typeof caretOffset === "number" && caretOffset >= 0) {
    return findParagraphIndexAtOffset(normalized, caretOffset) ?? 0;
  }

  return 0;
}

/**
 * Start from caret/selection paragraph and continue to chapter end.
 * Non-empty selection still starts at the first selected paragraph (not limited to selection end).
 */
function buildSpeakPlan(
  content: string,
  selection: ChapterEditorSelectionRange | null,
  caretOffset: number | null,
): SpeakPlan | null {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) {
    return null;
  }

  const startIndex = resolveStartParagraphIndex(content, selection, caretOffset);
  return {
    chunks: paragraphs.slice(startIndex),
    baseParagraphIndex: startIndex,
  };
}

function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string): SpeechSynthesisVoice | null {
  if (voices.length === 0) {
    return null;
  }
  if (voiceURI) {
    const exact = voices.find((voice) => voice.voiceURI === voiceURI);
    if (exact) {
      return exact;
    }
  }
  return voices.find((voice) => /zh|chinese|中文/i.test(`${voice.lang} ${voice.name}`))
    ?? voices[0]
    ?? null;
}

export function useChapterEditorSpeech(params: {
  content: string;
  selection: ChapterEditorSelectionRange | null;
  caretOffset: number | null;
}) {
  const { content, selection, caretOffset } = params;
  const [status, setStatus] = useState<ChapterEditorSpeechStatus>("idle");
  const [prefs, setPrefs] = useState<ChapterEditorSpeechPrefs>(() => loadSpeechPrefs());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingParagraphIndex, setSpeakingParagraphIndex] = useState<number | null>(null);

  const planRef = useRef<SpeakPlan | null>(null);
  const chunkIndexRef = useRef(0);
  const prefsRef = useRef(prefs);
  const statusRef = useRef(status);
  const generationRef = useRef(0);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const loadVoices = () => {
      const next = window.speechSynthesis.getVoices();
      setVoices(next);
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      generationRef.current += 1;
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const updatePrefs = useCallback((patch: Partial<ChapterEditorSpeechPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      saveSpeechPrefs(next);
      return next;
    });
  }, []);

  const finish = useCallback(() => {
    planRef.current = null;
    chunkIndexRef.current = 0;
    setSpeakingParagraphIndex(null);
    setStatus("idle");
  }, []);

  const speakChunkAt = useCallback((index: number, generation: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      finish();
      return;
    }
    if (generation !== generationRef.current) {
      return;
    }
    const plan = planRef.current;
    const chunk = plan?.chunks[index];
    if (!plan || !chunk) {
      finish();
      return;
    }

    chunkIndexRef.current = index;
    setSpeakingParagraphIndex(plan.baseParagraphIndex + index);
    setStatus("playing");

    const utterance = new SpeechSynthesisUtterance(chunk.slice(0, 4_000));
    utterance.lang = "zh-CN";
    utterance.rate = prefsRef.current.rate;
    const voice = pickVoice(window.speechSynthesis.getVoices(), prefsRef.current.voiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || "zh-CN";
    }
    utterance.onend = () => {
      if (generation !== generationRef.current) {
        return;
      }
      speakChunkAt(index + 1, generation);
    };
    utterance.onerror = () => {
      if (generation !== generationRef.current) {
        return;
      }
      finish();
    };
    window.speechSynthesis.speak(utterance);
  }, [finish]);

  const jumpToChunk = useCallback((index: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const plan = planRef.current;
    if (!plan || index < 0 || index >= plan.chunks.length) {
      return;
    }
    if (statusRef.current === "idle") {
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      if (generation !== generationRef.current) {
        return;
      }
      speakChunkAt(index, generation);
    }, 0);
  }, [speakChunkAt]);

  const jumpBy = useCallback((delta: number) => {
    jumpToChunk(chunkIndexRef.current + delta);
  }, [jumpToChunk]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    finish();
  }, [finish]);

  const pause = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    if (statusRef.current !== "playing") {
      return;
    }
    window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    if (statusRef.current !== "paused") {
      return;
    }
    window.speechSynthesis.resume();
    setStatus("playing");
  }, []);

  const togglePause = useCallback(() => {
    if (statusRef.current === "playing") {
      pause();
      return;
    }
    if (statusRef.current === "paused") {
      resume();
    }
  }, [pause, resume]);

  const start = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }
    const plan = buildSpeakPlan(content, selection, caretOffset);
    if (!plan || plan.chunks.length === 0) {
      return false;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    window.speechSynthesis.cancel();
    planRef.current = plan;
    chunkIndexRef.current = 0;
    window.setTimeout(() => {
      if (generation !== generationRef.current) {
        return;
      }
      speakChunkAt(0, generation);
    }, 0);
    return true;
  }, [caretOffset, content, selection, speakChunkAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (statusRef.current === "idle") {
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        togglePause();
        return;
      }

      if (
        event.key === "ArrowUp"
        || event.key === "ArrowLeft"
        || event.key === "ArrowDown"
        || event.key === "ArrowRight"
      ) {
        event.preventDefault();
        if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
          jumpBy(-1);
          return;
        }
        jumpBy(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpBy, togglePause]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const chineseVoices = voices.filter((voice) => /zh|chinese|中文/i.test(`${voice.lang} ${voice.name}`));
  const voiceOptions = chineseVoices.length > 0 ? chineseVoices : voices;

  return {
    status,
    prefs,
    voiceOptions,
    speakingParagraphIndex,
    supported: typeof window !== "undefined" && "speechSynthesis" in window,
    start,
    stop,
    togglePause,
    jumpBy,
    updatePrefs,
  };
}
