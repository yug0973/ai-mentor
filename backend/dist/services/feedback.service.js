"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logFeedbackEvent = logFeedbackEvent;
exports.getFeedbackSummary = getFeedbackSummary;
const prisma_1 = require("../config/prisma");
const engine = __importStar(require("./mentorEngineClient"));
/**
 * Logs a feedback event with mentor_ai_engine (for its own eval harness,
 * GET /feedback/summary) and mirrors it locally so the frontend can query
 * a user's own feedback history without round-tripping to the engine.
 */
async function logFeedbackEvent(userId, input) {
    const result = await engine.logFeedbackEvent({
        userId,
        eventType: input.eventType,
        referenceId: input.referenceId,
        outcomeNote: input.outcomeNote,
    });
    const stored = await prisma_1.prisma.engineFeedbackEvent.create({
        data: {
            userId,
            eventType: input.eventType,
            referenceId: input.referenceId,
            outcomeNote: input.outcomeNote,
        },
    });
    return { logged: result.logged, event: stored };
}
/**
 * Proxies mentor_ai_engine's eval-harness summary directly — this is
 * explicitly not part of the frozen API contract (an internal ops/eval
 * endpoint, per mentorEngineClient.ts), so it's passed through rather than
 * persisted or reshaped locally.
 */
async function getFeedbackSummary(userId) {
    return engine.getFeedbackSummary(userId);
}
//# sourceMappingURL=feedback.service.js.map