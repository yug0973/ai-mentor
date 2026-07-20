import { z } from "zod";

export const logFeedbackEventSchema = z.object({
  body: z.object({
    eventType: z.enum([
      "nudge_shown",
      "nudge_followed",
      "nudge_ignored",
      "roadmap_change_accepted",
      "roadmap_change_reverted",
    ]),
    referenceId: z.string().min(1),
    outcomeNote: z.string().optional(),
  }),
});

export type LogFeedbackEventInput = z.infer<typeof logFeedbackEventSchema>["body"];
