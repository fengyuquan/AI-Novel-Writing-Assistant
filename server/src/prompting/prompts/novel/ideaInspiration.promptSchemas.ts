import { z } from "zod";

export function createDirectorIdeaInspirationSchema(count: number) {
  const safeCount = Math.max(1, Math.floor(count));
  return z.object({
    ideas: z.array(z.object({
      angle: z.string().trim().min(1),
      text: z.string().trim().min(20).max(180),
      tags: z.array(z.string().trim().min(1).max(12)).min(1).max(4),
    })).length(safeCount),
  });
}

/** Registry / fallback default (matches historical product default of 5). */
export const directorIdeaInspirationSchema = createDirectorIdeaInspirationSchema(5);
