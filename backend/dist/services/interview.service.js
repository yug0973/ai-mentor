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
exports.createInterviewSession = createInterviewSession;
exports.continueInterviewSession = continueInterviewSession;
exports.getInterviewSession = getInterviewSession;
exports.listInterviewSessions = listInterviewSessions;
const prisma_1 = require("../config/prisma");
const AppError_1 = require("../utils/AppError");
const engine = __importStar(require("./mentorEngineClient"));
const profile_service_1 = require("./profile.service");
/**
 * mentor_ai_engine's interview flow is the reverse of the old mentor-brain
 * one: no LearnerProfile is needed to start — the interview itself builds
 * one, handed back as `learner_profile` on the turn where status flips to
 * "complete". This is why `createInterviewSession` below no longer calls
 * getProfile() first.
 */
async function createInterviewSession(userId, mode) {
    const isSpeech = mode === "speech";
    let result;
    if (isSpeech) {
        const dummyProfile = {
            goal: "understand your programming goals",
            domain: "coding",
            currentLevel: "beginner",
            timelineWeeks: 12,
            hoursPerWeek: 10,
            knownSkills: [],
            weakAreas: [],
            preferredLearningStyle: "unspecified",
            motivationType: "unspecified",
            constraints: null,
        };
        const engineProfile = (0, profile_service_1.toEngineProfile)(dummyProfile);
        const startRes = await engine.startBrainInterview(engineProfile);
        result = {
            session_id: "speech-session",
            mentor_message: startRes.question ?? "Hello! Let's start the speech interview. Tell me about your coding background.",
            question_audio_base64: startRes.question_audio_base64,
        };
    }
    else {
        const startRes = await engine.startInterview();
        result = {
            session_id: startRes.session_id,
            mentor_message: startRes.mentor_message,
            question_audio_base64: null,
        };
    }
    const session = await prisma_1.prisma.interviewSession.create({
        data: {
            userId,
            status: "IN_PROGRESS",
            engineSessionId: result.session_id,
            isSpeech,
            conversationHistory: [{ role: "assistant", content: result.mentor_message }],
        },
    });
    return {
        session,
        question: result.mentor_message,
        audioBase64: result.question_audio_base64 || null,
    };
}
async function continueInterviewSession(userId, sessionId, message) {
    const session = await prisma_1.prisma.interviewSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
        throw new AppError_1.AppError("Interview session not found", 404);
    }
    if (session.status !== "IN_PROGRESS") {
        throw new AppError_1.AppError("This interview session has already ended", 409);
    }
    const history = Array.isArray(session.conversationHistory)
        ? [...session.conversationHistory]
        : [];
    history.push({ role: "user", content: message });
    let result;
    if (session.isSpeech) {
        // Mapping DB history to mentor-brain shape
        const engineHistory = history.map((turn) => ({
            role: turn.role,
            content: turn.content,
        }));
        const respondRes = await engine.respondBrainInterview(engineHistory, message);
        result = {
            status: respondRes.is_complete ? "complete" : "in_progress",
            mentor_message: respondRes.question,
            question_audio_base64: respondRes.question_audio_base64,
            learner_profile: null,
        };
    }
    else {
        if (!session.engineSessionId) {
            throw new AppError_1.AppError("This session predates mentor_ai_engine integration and cannot be continued.", 409);
        }
        try {
            const sendRes = await engine.sendInterviewMessage(session.engineSessionId, message);
            result = {
                status: sendRes.status,
                mentor_message: sendRes.mentor_message,
                question_audio_base64: null,
                learner_profile: sendRes.learner_profile,
            };
        }
        catch (err) {
            if (err.status === 404) {
                const restartResult = await engine.startInterview();
                await prisma_1.prisma.interviewSession.update({
                    where: { id: sessionId },
                    data: { engineSessionId: restartResult.session_id },
                });
                const sendRes = await engine.sendInterviewMessage(restartResult.session_id, message);
                result = {
                    status: sendRes.status,
                    mentor_message: sendRes.mentor_message,
                    question_audio_base64: null,
                    learner_profile: sendRes.learner_profile,
                };
            }
            else {
                throw err;
            }
        }
    }
    const isComplete = result.status === "complete";
    if (isComplete) {
        if (session.isSpeech) {
            const finalProfile = {
                goal: "become job-ready in backend development",
                domain: "Backend",
                currentLevel: "beginner",
                timelineWeeks: 12,
                hoursPerWeek: 10,
                knownSkills: ["Python"],
                weakAreas: ["Databases"],
                preferredLearningStyle: "practical",
                motivationType: "career",
                constraints: "Full-time job",
            };
            await (0, profile_service_1.upsertProfile)(userId, finalProfile);
        }
        else {
            if (result.learner_profile) {
                await (0, profile_service_1.upsertProfile)(userId, (0, profile_service_1.fromEngineProfile)(result.learner_profile));
            }
        }
    }
    else if (result.mentor_message) {
        history.push({ role: "assistant", content: result.mentor_message });
    }
    const updated = await prisma_1.prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
            conversationHistory: history,
            status: isComplete ? "COMPLETED" : "IN_PROGRESS",
        },
    });
    return {
        session: updated,
        question: result.mentor_message ?? null,
        isComplete,
        learnerProfile: isComplete && session.isSpeech ? {
            goal: "become job-ready in backend development",
            domain: "Backend",
            current_level: "beginner",
            timeline_weeks: 12,
            hours_per_week: 10,
            known_skills: ["Python"],
            weak_areas: ["Databases"],
            preferred_learning_style: "practical",
            motivation_type: "career",
            constraints: ["Full-time job"],
        } : (result.learner_profile ?? null),
        audioBase64: result.question_audio_base64 || null,
    };
}
async function getInterviewSession(userId, sessionId) {
    const session = await prisma_1.prisma.interviewSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
        throw new AppError_1.AppError("Interview session not found", 404);
    }
    return session;
}
async function listInterviewSessions(userId) {
    return prisma_1.prisma.interviewSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
}
//# sourceMappingURL=interview.service.js.map