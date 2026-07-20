import { z } from "zod";

export const upsertProfileSchema = z.object({
  body: z.object({
    goal: z.string().min(3),
    domain: z.string().min(2),
    currentLevel: z.enum(["beginner", "intermediate", "advanced"]),
    timelineWeeks: z.number().int().positive(),
    hoursPerWeek: z.number().int().positive(),
    knownSkills: z.array(z.string()).default([]),
    weakAreas: z.array(z.string()).default([]),
    preferredLearningStyle: z.string().min(2),
    motivationType: z.string().min(2),
    constraints: z.string().optional(),
  }),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>["body"];
