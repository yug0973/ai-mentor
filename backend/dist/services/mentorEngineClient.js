"use strict";
/**
 * mentorEngineClient.ts
 * -----------------------------------------------------------------------
 * HTTP client for calling `mentor_ai_engine` (the standalone FastAPI AI
 * service — all 8 phases) from the Node/Express backend.
 *
 * This is the only AI service this backend talks to — no voice/audio,
 * mentor-brain is not called from anywhere in this codebase.
 *
 * Schemas mirror app/models.py in mentor_ai_engine exactly (frozen per
 * API_CONTRACT.md) — don't rename fields without updating both sides.
 *
 * Zero external dependencies: uses Node's built-in `fetch` (Node 18+,
 * which Docker images built on recent node: tags already have). If your
 * project standardizes on axios instead, the shapes/types below still
 * apply — only `request()` at the bottom would need to change.
 * -----------------------------------------------------------------------
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineNetworkError = exports.EngineHttpError = exports.EngineTimeoutError = void 0;
exports.startInterview = startInterview;
exports.sendInterviewMessage = sendInterviewMessage;
exports.getInterviewStatus = getInterviewStatus;
exports.startBrainInterview = startBrainInterview;
exports.respondBrainInterview = respondBrainInterview;
exports.generateRoadmap = generateRoadmap;
exports.getRoadmapDebug = getRoadmapDebug;
exports.generateQuiz = generateQuiz;
exports.logSession = logSession;
exports.adaptRoadmap = adaptRoadmap;
exports.classifyIntent = classifyIntent;
exports.checkNudge = checkNudge;
exports.generateWeeklyReview = generateWeeklyReview;
exports.logFeedbackEvent = logFeedbackEvent;
exports.getFeedbackSummary = getFeedbackSummary;
exports.checkEngineHealth = checkEngineHealth;
const env_1 = require("../config/env");
// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ENGINE_BASE_URL = env_1.env.ENGINE_BASE_URL;
const BRAIN_BASE_URL = env_1.env.BRAIN_BASE_URL;
// Per-endpoint timeouts. Phase 2 (roadmap generation, two real LLM passes)
// and Phase 4 (adaptive rewrite) are meaningfully slower than the rest —
// don't use one blanket timeout for all 8 phases.
const TIMEOUTS_MS = {
    interviewStart: 15000,
    interviewMessage: 20000,
    interviewStatus: 5000,
    roadmapGenerate: 45000, // two-pass LLM generation — the slowest call in the service
    roadmapGet: 5000,
    sessionLog: 5000, // no LLM at all — should always be fast
    roadmapAdapt: 30000, // targeted LLM rewrite
    intentClassify: 10000,
    nudgeCheck: 15000,
    weeklyReview: 20000,
    feedbackEvent: 5000, // no LLM at all
    feedbackSummary: 5000, // no LLM at all
    quizGenerate: 25000, // single batched LLM call covering all topics in a milestone
};
// ---------------------------------------------------------------------------
// Error types — so callers can distinguish timeout vs. HTTP error vs. network
// ---------------------------------------------------------------------------
class EngineTimeoutError extends Error {
    constructor(path, timeoutMs) {
        super(`mentor_ai_engine request to ${path} timed out after ${timeoutMs}ms`);
        this.path = path;
        this.timeoutMs = timeoutMs;
        this.name = "EngineTimeoutError";
    }
}
exports.EngineTimeoutError = EngineTimeoutError;
class EngineHttpError extends Error {
    constructor(path, status, body) {
        super(`mentor_ai_engine request to ${path} failed with HTTP ${status}`);
        this.path = path;
        this.status = status;
        this.body = body;
        this.name = "EngineHttpError";
    }
}
exports.EngineHttpError = EngineHttpError;
class EngineNetworkError extends Error {
    constructor(path, cause) {
        super(`mentor_ai_engine request to ${path} failed: network error`);
        this.path = path;
        this.cause = cause;
        this.name = "EngineNetworkError";
    }
}
exports.EngineNetworkError = EngineNetworkError;
// ---------------------------------------------------------------------------
// Internal request helper
// ---------------------------------------------------------------------------
async function request(method, path, timeoutMs, body) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${ENGINE_BASE_URL}${path}`, {
            method,
            headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        if (!res.ok) {
            let parsedBody;
            try {
                parsedBody = await res.json();
            }
            catch {
                parsedBody = await res.text().catch(() => null);
            }
            throw new EngineHttpError(path, res.status, parsedBody);
        }
        return (await res.json());
    }
    catch (err) {
        if (err instanceof EngineHttpError)
            throw err;
        if (err instanceof Error && err.name === "AbortError") {
            throw new EngineTimeoutError(path, timeoutMs);
        }
        throw new EngineNetworkError(path, err);
    }
    finally {
        clearTimeout(timeoutHandle);
    }
}
async function requestBrain(method, path, timeoutMs, body) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${BRAIN_BASE_URL}${path}`, {
            method,
            headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        if (!res.ok) {
            let parsedBody;
            try {
                parsedBody = await res.json();
            }
            catch {
                parsedBody = await res.text().catch(() => null);
            }
            throw new EngineHttpError(path, res.status, parsedBody);
        }
        return (await res.json());
    }
    catch (err) {
        if (err instanceof EngineHttpError)
            throw err;
        if (err instanceof Error && err.name === "AbortError") {
            throw new EngineTimeoutError(path, timeoutMs);
        }
        throw new EngineNetworkError(path, err);
    }
    finally {
        clearTimeout(timeoutHandle);
    }
}
// ---------------------------------------------------------------------------
// Phase 1 — Goal Understanding (interview)
// ---------------------------------------------------------------------------
function startInterview() {
    return request("POST", "/interview/start", TIMEOUTS_MS.interviewStart);
}
function sendInterviewMessage(sessionId, message) {
    return request("POST", "/interview/message", TIMEOUTS_MS.interviewMessage, {
        session_id: sessionId,
        message,
    });
}
function getInterviewStatus(sessionId) {
    return request("GET", `/interview/${encodeURIComponent(sessionId)}`, TIMEOUTS_MS.interviewStatus);
}
function startBrainInterview(profile) {
    return requestBrain("POST", "/interview/start", TIMEOUTS_MS.interviewStart, {
        profile,
    });
}
function respondBrainInterview(conversationHistory, message) {
    return requestBrain("POST", "/interview/respond", TIMEOUTS_MS.interviewMessage, {
        conversation_history: conversationHistory,
        message,
    });
}
// ---------------------------------------------------------------------------
// Phase 2 — Roadmap Generator
// ---------------------------------------------------------------------------
/**
 * NOT IDEMPOTENT — every call mints a fresh roadmap_id and (in real mode)
 * triggers a real, billed two-pass LLM generation. Do NOT blindly retry
 * this on a timeout from your HTTP client/proxy layer; if you need
 * retry-safety, dedupe on your side (e.g. check whether a roadmap for this
 * user_id + learner_profile was already created in your own DB before
 * calling again).
 */
function generateRoadmap(userId, learnerProfile) {
    return request("POST", "/roadmap/generate", TIMEOUTS_MS.roadmapGenerate, {
        user_id: userId,
        learner_profile: learnerProfile,
    });
}
/**
 * Debug/convenience lookup against the engine's own in-memory roadmap
 * store — NOT your source of truth. Persist the Roadmap returned by
 * generateRoadmap()/adaptRoadmap() into your own database and read it back
 * from there; this in-memory copy is wiped on every engine restart and
 * won't exist at all if the engine is ever scaled to multiple replicas.
 */
function getRoadmapDebug(roadmapId) {
    return request("GET", `/roadmap/${encodeURIComponent(roadmapId)}`, TIMEOUTS_MS.roadmapGet);
}
function generateQuiz(milestoneId, currentLevel, topics) {
    return request("POST", "/quiz/generate", TIMEOUTS_MS.quizGenerate, {
        milestone_id: milestoneId,
        current_level: currentLevel,
        topics,
    });
}
function logSession(params) {
    return request("POST", "/sessions/log", TIMEOUTS_MS.sessionLog, {
        user_id: params.userId,
        roadmap_id: params.roadmapId,
        topic_ids_covered: params.topicIdsCovered,
        duration_minutes: params.durationMinutes,
        self_rated_difficulty: params.selfRatedDifficulty ?? null,
        notes: params.notes ?? null,
    });
}
/**
 * roadmapId must be one this same engine process generated (see the
 * single-instance caveat in TEAM_OVERVIEW.md) — an unknown roadmap_id
 * degrades silently to mock output rather than erroring, so don't treat a
 * 200 response alone as proof the real roadmap was actually adapted; check
 * `changed` and `change_summary` too.
 */
function adaptRoadmap(params) {
    return request("POST", "/roadmap/adapt", TIMEOUTS_MS.roadmapAdapt, {
        user_id: params.userId,
        roadmap_id: params.roadmapId,
        milestone_id: params.milestoneId,
        quiz_id: params.quizId,
        score_percent: params.scorePercent,
        topic_breakdown: params.topicBreakdown ?? {},
    });
}
// ---------------------------------------------------------------------------
// Phase 5 — Intent Parser
// ---------------------------------------------------------------------------
function classifyIntent(userId, message) {
    return request("POST", "/intent/classify", TIMEOUTS_MS.intentClassify, {
        user_id: userId,
        message,
    });
}
// ---------------------------------------------------------------------------
// Phase 6 — Motivation Detector / Nudges
// ---------------------------------------------------------------------------
function checkNudge(userId) {
    return request("GET", `/nudges/check/${encodeURIComponent(userId)}`, TIMEOUTS_MS.nudgeCheck);
}
// ---------------------------------------------------------------------------
// Phase 7 — Weekly Review Generator
// ---------------------------------------------------------------------------
function generateWeeklyReview(userId) {
    return request("POST", `/reviews/weekly/${encodeURIComponent(userId)}`, TIMEOUTS_MS.weeklyReview);
}
function logFeedbackEvent(params) {
    return request("POST", "/feedback/event", TIMEOUTS_MS.feedbackEvent, {
        user_id: params.userId,
        event_type: params.eventType,
        reference_id: params.referenceId,
        outcome_note: params.outcomeNote ?? null,
    });
}
/** NOT part of the frozen API_CONTRACT — internal ops/eval endpoint. */
function getFeedbackSummary(userId) {
    const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
    return request("GET", `/feedback/summary${qs}`, TIMEOUTS_MS.feedbackSummary);
}
// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------
function checkEngineHealth() {
    return request("GET", "/health", 5000);
}
//# sourceMappingURL=mentorEngineClient.js.map