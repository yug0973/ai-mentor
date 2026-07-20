"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTopicStatusSchema = exports.adaptRoadmapSchema = exports.updateProgressSchema = exports.generateRoadmapSchema = void 0;
const zod_1 = require("zod");
exports.generateRoadmapSchema = zod_1.z.object({
    body: zod_1.z.object({}).optional(),
});
exports.updateProgressSchema = zod_1.z.object({
    params: zod_1.z.object({
        roadmapId: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        progressPercent: zod_1.z.number().int().min(0).max(100),
    }),
});
exports.adaptRoadmapSchema = zod_1.z.object({
    params: zod_1.z.object({
        roadmapId: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        milestoneId: zod_1.z.string().min(1),
        quizId: zod_1.z.string().min(1),
        scorePercent: zod_1.z.number().min(0).max(100),
        topicBreakdown: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
    }),
});
exports.updateTopicStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        roadmapId: zod_1.z.string().uuid(),
        topicId: zod_1.z.string().min(1),
    }),
    body: zod_1.z.object({
        status: zod_1.z.enum(["locked", "completed", "available", "in_progress"]),
    }),
});
//# sourceMappingURL=roadmap.schema.js.map