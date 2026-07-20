"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiServiceClient = void 0;
exports.startInterview = startInterview;
exports.respondToInterview = respondToInterview;
exports.generateRoadmap = generateRoadmap;
exports.checkNudge = checkNudge;
exports.generateWeeklyReview = generateWeeklyReview;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
/**
 * Shared HTTP client for talking to the FastAPI "Mentor Brain" service.
 * The frontend never calls FastAPI directly — every AI call is proxied
 * through this backend, which validates the request, calls this client,
 * persists the response, then returns it to the frontend.
 */
exports.aiServiceClient = axios_1.default.create({
    baseURL: env_1.env.AI_SERVICE_BASE_URL,
    timeout: env_1.env.AI_SERVICE_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
});
async function startInterview(profile) {
    const { data } = await exports.aiServiceClient.post("/interview/start", { profile });
    return {
        question: data.question ?? null,
        conversationHistory: data.conversation_history,
        isComplete: Boolean(data.is_complete),
    };
}
async function respondToInterview(conversationHistory, message) {
    const { data } = await exports.aiServiceClient.post("/interview/respond", {
        conversation_history: conversationHistory,
        message,
    });
    return {
        question: data.question ?? null,
        conversationHistory: data.conversation_history,
        isComplete: Boolean(data.is_complete),
    };
}
async function generateRoadmap(profile, interviewSummary) {
    const { data } = await exports.aiServiceClient.post("/roadmap/generate", {
        profile,
        interview_summary: interviewSummary ?? null,
    });
    return {
        goal: data.goal,
        milestones: data.milestones,
    };
}
async function checkNudge(profile, recentSessionSummary) {
    const { data } = await exports.aiServiceClient.post("/nudges/check", {
        profile,
        recent_activity: recentSessionSummary,
    });
    return {
        nudgeTriggered: Boolean(data.nudge_triggered),
        message: data.message ?? null,
        triggerReason: data.trigger_reason ?? null,
    };
}
async function generateWeeklyReview(profile, sessionLogs) {
    const { data } = await exports.aiServiceClient.post("/reviews/weekly", {
        profile,
        session_logs: sessionLogs,
    });
    return {
        summary: data.summary,
        recommendations: data.recommendations,
        masteryScores: (data.mastery_scores ?? []).map((m) => ({
            topicId: m.topic_id,
            score: m.score,
        })),
    };
}
//# sourceMappingURL=aiService.client.js.map