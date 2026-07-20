import { z } from "zod";

export const createSessionLogSchema = z.object({
  body: z.object({
    duration: z.number().int().positive("Duration must be in minutes, > 0"),
    topics: z.array(z.string()).min(1, "At least one topic is required"),
    difficulty: z.enum(["easy", "medium", "hard"]),
    notes: z.string().optional(),
    date: z.string().datetime().optional(),
    // Optional for backward compatibility with existing frontend calls —
    // but required to also feed mentor_ai_engine's session tracker
    // (Phase 3) and get back updated mastery scores. Without it, the
    // session is still logged locally, just not sent to the engine.
    roadmapId: z.string().uuid().optional(),
  }),
});

export type CreateSessionLogInput = z.infer<typeof createSessionLogSchema>["body"];
