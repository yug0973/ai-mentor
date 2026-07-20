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
exports.logSession = logSession;
exports.listSessions = listSessions;
exports.getSession = getSession;
const prisma_1 = require("../config/prisma");
const AppError_1 = require("../utils/AppError");
const engine = __importStar(require("./mentorEngineClient"));
async function logSession(userId, input) {
    const log = await prisma_1.prisma.sessionLog.create({
        data: {
            userId,
            duration: input.duration,
            topics: input.topics,
            difficulty: input.difficulty,
            notes: input.notes,
            date: input.date ? new Date(input.date) : new Date(),
        },
    });
    // Also feed mentor_ai_engine's session tracker (Phase 3, no LLM —
    // always fast) so mastery scores update in real time. Only possible if
    // the caller told us which roadmap this session belongs to; older
    // clients that don't send roadmapId still get the local log above, just
    // without engine-side mastery tracking for this session.
    if (input.roadmapId) {
        try {
            const result = await engine.logSession({
                userId,
                roadmapId: input.roadmapId,
                topicIdsCovered: input.topics,
                durationMinutes: input.duration,
                selfRatedDifficulty: input.difficulty,
                notes: input.notes,
            });
            await Promise.all(result.updated_mastery.map((m) => prisma_1.prisma.masteryScore.upsert({
                where: { userId_topicId: { userId, topicId: m.topic_id } },
                create: { userId, topicId: m.topic_id, masteryScore: m.mastery_score },
                update: { masteryScore: m.mastery_score },
            })));
        }
        catch {
            // Engine-side tracking is a bonus, not a requirement — the local
            // session log above already succeeded, so don't fail the request
            // over this.
        }
    }
    return log;
}
async function listSessions(userId) {
    return prisma_1.prisma.sessionLog.findMany({
        where: { userId },
        orderBy: { date: "desc" },
    });
}
async function getSession(userId, sessionLogId) {
    const log = await prisma_1.prisma.sessionLog.findUnique({ where: { id: sessionLogId } });
    if (!log || log.userId !== userId) {
        throw new AppError_1.AppError("Session log not found", 404);
    }
    return log;
}
//# sourceMappingURL=session.service.js.map