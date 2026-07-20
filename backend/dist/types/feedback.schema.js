"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logFeedbackEventSchema = void 0;
const zod_1 = require("zod");
exports.logFeedbackEventSchema = zod_1.z.object({
    body: zod_1.z.object({
        eventType: zod_1.z.enum([
            "nudge_shown",
            "nudge_followed",
            "nudge_ignored",
            "roadmap_change_accepted",
            "roadmap_change_reverted",
        ]),
        referenceId: zod_1.z.string().min(1),
        outcomeNote: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=feedback.schema.js.map