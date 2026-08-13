import { z } from "zod";

export const chapterImageStoryPackOutputSchema = z.object({
  summary: z.string().trim().min(1),
  shots: z.array(z.object({
    order: z.number().int().min(1),
    action: z.string().trim().min(1),
    visualPrompt: z.string().trim().min(1),
    dialogue: z.string().trim().optional(),
    location: z.string().trim().optional(),
    shotSize: z.string().trim().optional(),
    durationSec: z.number().int().min(1).max(12).optional(),
    characterRefs: z.array(z.string().trim()).optional(),
  })).min(4).max(28),
});

export type ChapterImageStoryPackParsed = z.infer<typeof chapterImageStoryPackOutputSchema>;
