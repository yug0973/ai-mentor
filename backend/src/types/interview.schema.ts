import { z } from "zod";

export const startInterviewSchema = z.object({
  body: z.object({}).optional(),
});

export const respondInterviewSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid(),
  }),
  body: z.object({
    message: z.string().min(1, "Message cannot be empty"),
  }),
});

export type RespondInterviewInput = z.infer<typeof respondInterviewSchema>["body"];
