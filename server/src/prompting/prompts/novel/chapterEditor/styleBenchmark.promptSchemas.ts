import { z } from "zod";

export const chapterEditorStyleBenchmarkEssenceAnchorSchema = z.object({
  quote: z.string().trim().min(1).max(280),
  why: z.string().trim().min(1).max(200),
});

export const chapterEditorStyleBenchmarkEssenceSchema = z.object({
  voiceRules: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  dialogueRules: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  pacingRules: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  sensoryRules: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  forbidPatterns: z.array(z.string().trim().min(1).max(160)).max(8),
  fingerprintLines: z.array(z.string().trim().min(1).max(180)).min(3).max(5),
  sampleAnchors: z.array(chapterEditorStyleBenchmarkEssenceAnchorSchema).min(1).max(6),
  confidence: z.enum(["high", "medium", "low"]),
  gaps: z.array(z.string().trim().min(1).max(200)).max(6),
});

export const chapterEditorStyleBenchmarkComplianceSchema = z.object({
  covered: z.array(z.string().trim().min(1).max(180)).max(8),
  missed: z.array(z.string().trim().min(1).max(180)).max(8),
  notes: z.string().trim().min(1).max(800),
});

export const chapterEditorStyleBenchmarkRewriteSchema = z.object({
  benchmarkContent: z.string().trim().min(1).max(24000),
  styleNotes: z.string().trim().min(1).max(1200),
  plotFidelityNotes: z.string().trim().min(1).max(800),
  essenceCompliance: chapterEditorStyleBenchmarkComplianceSchema,
});

export const chapterEditorStyleBenchmarkSegmentRewriteSchema = z.object({
  segmentContent: z.string().trim().min(1).max(8000),
  styleNotes: z.string().trim().min(1).max(600),
  plotFidelityNotes: z.string().trim().min(1).max(400),
});

export const chapterEditorStyleBenchmarkUnifySchema = z.object({
  benchmarkContent: z.string().trim().min(1).max(24000),
  styleNotes: z.string().trim().min(1).max(800),
  plotFidelityNotes: z.string().trim().min(1).max(600),
  essenceCompliance: chapterEditorStyleBenchmarkComplianceSchema,
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

export type ChapterEditorStyleBenchmarkEssenceParsed = z.infer<
  typeof chapterEditorStyleBenchmarkEssenceSchema
>;
export type ChapterEditorStyleBenchmarkRewriteParsed = z.infer<
  typeof chapterEditorStyleBenchmarkRewriteSchema
>;
export type ChapterEditorStyleBenchmarkSegmentRewriteParsed = z.infer<
  typeof chapterEditorStyleBenchmarkSegmentRewriteSchema
>;
export type ChapterEditorStyleBenchmarkUnifyParsed = z.infer<
  typeof chapterEditorStyleBenchmarkUnifySchema
>;
export type ChapterEditorStyleBenchmarkCompareParsed = z.infer<
  typeof chapterEditorStyleBenchmarkCompareSchema
>;
