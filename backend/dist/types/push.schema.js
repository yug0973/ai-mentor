"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsubscribeSchema = exports.subscribeSchema = void 0;
const zod_1 = require("zod");
exports.subscribeSchema = zod_1.z.object({
    body: zod_1.z.object({
        endpoint: zod_1.z.string().url(),
        keys: zod_1.z.object({
            p256dh: zod_1.z.string().min(1),
            auth: zod_1.z.string().min(1),
        }),
    }),
});
exports.unsubscribeSchema = zod_1.z.object({
    body: zod_1.z.object({
        endpoint: zod_1.z.string().url(),
    }),
});
//# sourceMappingURL=push.schema.js.map