import { z } from "zod";

export const sendChatMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(4000),
  }),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>["body"];
