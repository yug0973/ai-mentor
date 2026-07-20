"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertProfileSchema = void 0;
const zod_1 = require("zod");
exports.upsertProfileSchema = zod_1.z.object({
    body: zod_1.z.object({
        goal: zod_1.z.string().min(3),
        domain: zod_1.z.string().min(2),
        currentLevel: zod_1.z.enum(["beginner", "intermediate", "advanced"]),
        timelineWeeks: zod_1.z.number().int().positive(),
        hoursPerWeek: zod_1.z.number().int().positive(),
        knownSkills: zod_1.z.array(zod_1.z.string()).default([]),
        weakAreas: zod_1.z.array(zod_1.z.string()).default([]),
        preferredLearningStyle: zod_1.z.string().min(2),
        motivationType: zod_1.z.string().min(2),
        constraints: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=profile.schema.js.map