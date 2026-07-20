import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // mentor_ai_engine — the only AI service this backend talks to
  // (interview, roadmap, nudges, reviews, feedback). Voice/TTS was
  // scrapped along with mentor-brain, which is fully retired now.
  ENGINE_BASE_URL: z.string().url(),

  CORS_ORIGIN: z.string().default("*"),

  // Email (SMTP) - optional. If unset, email sending is skipped with a
  // warning rather than blocking server startup.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
 SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("AI Mentor <no-reply@ai-mentor.app>"),

  // Web Push (VAPID) - optional, same reasoning as SMTP above.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@ai-mentor.app"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud. A misconfigured backend should never boot silently.
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
