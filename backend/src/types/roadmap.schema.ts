import { z } from "zod";

export const generateRoadmapSchema = z.object({
  body: z.object({}).optional(),
});

export const updateProgressSchema = z.object({
  params: z.object({
    roadmapId: z.string().uuid(),
  }),
  body: z.object({
    progressPercent: z.number().int().min(0).max(100),
  }),
});

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>["body"];

export const adaptRoadmapSchema = z.object({
  params: z.object({
    roadmapId: z.string().uuid(),
  }),
  body: z.object({
    milestoneId: z.string().min(1),
    quizId: z.string().min(1),
    scorePercent: z.number().min(0).max(100),
    topicBreakdown: z.record(z.string(), z.number()).optional(),
  }),
});

export const updateTopicStatusSchema = z.object({
  params: z.object({
    roadmapId: z.string().uuid(),
    topicId: z.string().min(1),
  }),
  body: z.object({
    status: z.enum(["locked", "completed", "available", "in_progress"]),
  }),
});

export type UpdateTopicStatusInput = z.infer<typeof updateTopicStatusSchema>["body"];

