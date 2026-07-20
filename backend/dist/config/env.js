"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(4000),
    NODE_ENV: zod_1.z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: zod_1.z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    JWT_EXPIRES_IN: zod_1.z.string().default("7d"),
    // mentor_ai_engine — the only AI service this backend talks to
    // (interview, roadmap, nudges, reviews, feedback). Voice/TTS was
    // scrapped along with mentor-brain, which is fully retired now.
    ENGINE_BASE_URL: zod_1.z.string().url(),
    BRAIN_BASE_URL: zod_1.z.string().url().default("http://localhost:8080"),
    CORS_ORIGIN: zod_1.z.string().default("*"),
    // Email (SMTP) - optional. If unset, email sending is skipped with a
    // warning rather than blocking server startup.
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().default(587),
    SMTP_SECURE: zod_1.z.coerce.boolean().default(false),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    SMTP_FROM: zod_1.z.string().default("AI Mentor <no-reply@ai-mentor.app>"),
    // Web Push (VAPID) - optional, same reasoning as SMTP above.
    VAPID_PUBLIC_KEY: zod_1.z.string().optional(),
    VAPID_PRIVATE_KEY: zod_1.z.string().optional(),
    VAPID_SUBJECT: zod_1.z.string().default("mailto:support@ai-mentor.app"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // Fail fast and loud. A misconfigured backend should never boot silently.
    console.error("Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map