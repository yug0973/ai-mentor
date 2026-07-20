"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionLogSchema = void 0;
const zod_1 = require("zod");
exports.createSessionLogSchema = zod_1.z.object({
    body: zod_1.z.object({
        duration: zod_1.z.number().int().positive("Duration must be in minutes, > 0"),
        topics: zod_1.z.array(zod_1.z.string()).min(1, "At least one topic is required"),
        difficulty: zod_1.z.enum(["easy", "medium", "hard"]),
        notes: zod_1.z.string().optional(),
        date: zod_1.z.string().datetime().optional(),
        // Optional for backward compatibility with existing frontend calls —
        // but required to also feed mentor_ai_engine's session tracker
        // (Phase 3) and get back updated mastery scores. Without it, the
        // session is still logged locally, just not sent to the engine.
        roadmapId: zod_1.z.string().uuid().optional(),
    }),
});
//# sourceMappingURL=session.schema.js.map