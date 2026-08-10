import { z } from "zod";

export const chapterEditorAiWritingDetectIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  code: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(400),
  evidence: z.string().trim().min(1).max(240),
  fixSuggestion: z.string().trim().min(1).max(400),
});

export const chapterEditorAiWritingDetectSchema = z.object({
  riskScore: z.number().min(0).max(100),
  summary: z.string().trim().min(1).max(500),
  naturalnessScore: z.number().min(0).max(100),
  issues: z.array(chapterEditorAiWritingDetectIssueSchema).max(12).default([]),
});

export type ChapterEditorAiWritingDetectParsed = z.infer<typeof chapterEditorAiWritingDetectSchema>;
