import { z } from "zod";

export const chapterEditorStyleBenchmarkRewriteSchema = z.object({
  benchmarkContent: z.string().trim().min(1).max(24000),
  styleNotes: z.string().trim().min(1).max(800),
  plotFidelityNotes: z.string().trim().min(1).max(800),
});

export const chapterEditorStyleBenchmarkSegmentSchema = z.object({
  segmentIndex: z.number().int().min(0).max(40),
  beatLabel: z.string().trim().min(1).max(80),
  userExcerpt: z.string().trim().min(1).max(1200),
  benchmarkExcerpt: z.string().trim().min(1).max(1200),
  winner: z.enum(["user", "benchmark", "tie"]),
  whyBetter: z.string().trim().min(1).max(500),
  howToImproveWeaker: z.string().trim().min(1).max(500),
});

export const chapterEditorStyleBenchmarkCompareSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  overallWinner: z.enum(["user", "benchmark", "tie"]),
  segments: z.array(chapterEditorStyleBenchmarkSegmentSchema).min(1).max(24),
});

export type ChapterEditorStyleBenchmarkRewriteParsed = z.infer<
  typeof chapterEditorStyleBenchmarkRewriteSchema
>;
export type ChapterEditorStyleBenchmarkCompareParsed = z.infer<
  typeof chapterEditorStyleBenchmarkCompareSchema
>;
