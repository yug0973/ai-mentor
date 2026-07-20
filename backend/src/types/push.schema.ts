import { z } from "zod";

export const subscribeSchema = z.object({
  body: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export const unsubscribeSchema = z.object({
  body: z.object({
    endpoint: z.string().url(),
  }),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>["body"];
