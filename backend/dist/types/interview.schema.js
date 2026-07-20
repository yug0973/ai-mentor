"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.respondInterviewSchema = exports.startInterviewSchema = void 0;
const zod_1 = require("zod");
exports.startInterviewSchema = zod_1.z.object({
    body: zod_1.z.object({
        mode: zod_1.z.enum(["speech", "text"]).optional(),
    }).optional(),
});
exports.respondInterviewSchema = zod_1.z.object({
    params: zod_1.z.object({
        sessionId: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        message: zod_1.z.string().min(1, "Message cannot be empty"),
    }),
});
//# sourceMappingURL=interview.schema.js.map