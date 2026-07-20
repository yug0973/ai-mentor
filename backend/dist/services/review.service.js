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
exports.generateAndSaveWeeklyReview = generateAndSaveWeeklyReview;
exports.listWeeklyReviews = listWeeklyReviews;
exports.listMasteryScores = listMasteryScores;
const prisma_1 = require("../config/prisma");
const engine = __importStar(require("./mentorEngineClient"));
/**
 * Runs the weekly review for a single user via mentor_ai_engine, and
 * persists it. NOTE: the engine's WeeklyReviewResponse shape
 * (sessions_completed, total_hours, topics_improved/stagnant,
 * goal_progress_percent, next_week_focus, motivational_insight) is
 * different from what the old mentor-brain contract returned
 * (summary/recommendations/masteryScores), which is what feedback_events'
 * columns were originally shaped around. Rather than migrate that table,
 * this maps the new fields into the existing columns:
 *   - summary            <- motivational_insight
 *   - recommendations    <- the rest of the structured fields, as JSON
 *   - masteryScoresSnapshot <- {} (per-topic scores now come from the
 *     session tracker's logSession() calls instead — see session.service.ts)
 * Used by both the weekly cron job and the manual-trigger route.
 */
async function generateAndSaveWeeklyReview(userId) {
    const result = await engine.generateWeeklyReview(userId);
    const feedbackEvent = await prisma_1.prisma.feedbackEvent.create({
        data: {
            userId,
            summary: result.motivational_insight,
            recommendations: {
                weekStart: result.week_start,
                weekEnd: result.week_end,
                sessionsCompleted: result.sessions_completed,
                totalHours: result.total_hours,
                topicsImproved: result.topics_improved,
                topicsStagnant: result.topics_stagnant,
                goalProgressPercent: result.goal_progress_percent,
                nextWeekFocus: result.next_week_focus,
            },
            masteryScoresSnapshot: {},
        },
    });
    return feedbackEvent;
}
async function listWeeklyReviews(userId) {
    return prisma_1.prisma.feedbackEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
}
async function listMasteryScores(userId) {
    return prisma_1.prisma.masteryScore.findMany({
        where: { userId },
        orderBy: { topicId: "asc" },
    });
}
//# sourceMappingURL=review.service.js.map