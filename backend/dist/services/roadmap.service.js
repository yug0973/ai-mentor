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
exports.createRoadmap = createRoadmap;
exports.listRoadmaps = listRoadmaps;
exports.getRoadmap = getRoadmap;
exports.generateMilestoneQuiz = generateMilestoneQuiz;
exports.updateProgress = updateProgress;
exports.adaptRoadmap = adaptRoadmap;
exports.updateTopicStatus = updateTopicStatus;
const prisma_1 = require("../config/prisma");
const AppError_1 = require("../utils/AppError");
const engine = __importStar(require("./mentorEngineClient"));
const profile_service_1 = require("./profile.service");
async function createRoadmap(userId) {
    const profile = await (0, profile_service_1.getProfile)(userId);
    const engineProfile = (0, profile_service_1.toEngineProfile)(profile);
    // NOT idempotent — mentor_ai_engine mints a fresh roadmap_id and (in real
    // mode) runs a real, billed two-pass LLM generation on every call. Do not
    // retry this blindly on a timeout; if retry-safety matters, dedupe on the
    // caller side first.
    const result = await engine.generateRoadmap(userId, engineProfile);
    const roadmap = await prisma_1.prisma.roadmap.create({
        data: {
            userId,
            goal: result.goal,
            milestones: result.milestones.map(m => ({
                ...m,
                resources: getResourceLinks(m.title, profile.domain),
            })),
            progressPercent: result.progress_percent,
            engineRoadmapId: result.roadmap_id,
            generatedFromProfileVersion: result.generated_from_profile_version,
        },
    });
    return roadmap;
}
async function listRoadmaps(userId) {
    return prisma_1.prisma.roadmap.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
}
async function getRoadmap(userId, roadmapId) {
    const roadmap = await prisma_1.prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!roadmap || roadmap.userId !== userId) {
        throw new AppError_1.AppError("Roadmap not found", 404);
    }
    return roadmap;
}
/**
 * Generates one real, topic-specific quiz question per topic in the given
 * milestone — replaces the frontend's old client-side fake (a single
 * hardcoded generic question reused for every topic).
 *
 * NOT cached/idempotent — every call triggers a real, billed LLM call on
 * mentor_ai_engine's side. The frontend should call this once when the
 * quiz modal opens, not on every render.
 */
async function generateMilestoneQuiz(userId, roadmapId, milestoneId) {
    const roadmap = await getRoadmap(userId, roadmapId);
    const profile = await (0, profile_service_1.getProfile)(userId);
    const milestones = roadmap.milestones;
    const milestone = milestones.find((m) => m.milestone_id === milestoneId);
    if (!milestone) {
        throw new AppError_1.AppError("Milestone not found on this roadmap", 404);
    }
    if (!milestone.topics.length) {
        throw new AppError_1.AppError("This milestone has no topics to quiz on", 400);
    }
    return engine.generateQuiz(milestoneId, profile.currentLevel, milestone.topics);
}
async function updateProgress(userId, roadmapId, progressPercent) {
    const roadmap = await getRoadmap(userId, roadmapId);
    return prisma_1.prisma.roadmap.update({
        where: { id: roadmap.id },
        data: { progressPercent },
    });
}
async function adaptRoadmap(userId, roadmapId, input) {
    const roadmap = await getRoadmap(userId, roadmapId);
    if (!roadmap.engineRoadmapId) {
        // Roadmaps created before this integration have no engine-side roadmap
        // to adapt against — nothing to do but say so clearly.
        throw new AppError_1.AppError("This roadmap has no associated mentor_ai_engine roadmap_id and cannot be adapted.", 409);
    }
    const result = await engine.adaptRoadmap({
        userId,
        roadmapId: roadmap.engineRoadmapId,
        milestoneId: input.milestoneId,
        quizId: input.quizId,
        scorePercent: input.scorePercent,
        topicBreakdown: input.topicBreakdown,
    });
    const profile = await (0, profile_service_1.getProfile)(userId);
    const updatedMilestones = result.updated_roadmap.milestones.map(m => {
        const existing = (roadmap.milestones || []).find((em) => em.milestone_id === m.milestone_id);
        if (existing && existing.resources && existing.resources.length > 0) {
            return { ...m, resources: existing.resources };
        }
        return { ...m, resources: getResourceLinks(m.title, profile.domain) };
    });
    const updated = await prisma_1.prisma.roadmap.update({
        where: { id: roadmap.id },
        data: { milestones: updatedMilestones },
    });
    if (result.changed) {
        await prisma_1.prisma.engineFeedbackEvent.create({
            data: {
                userId,
                eventType: "roadmap_change_accepted",
                referenceId: roadmap.engineRoadmapId,
                outcomeNote: result.change_summary,
            },
        });
    }
    return { roadmap: updated, changed: result.changed, changeSummary: result.change_summary };
}
async function updateTopicStatus(userId, roadmapId, topicId, status) {
    const roadmap = await getRoadmap(userId, roadmapId);
    const milestones = roadmap.milestones || [];
    let topicFound = false;
    milestones.forEach((m) => {
        m.topics.forEach((t) => {
            if (t.topic_id === topicId) {
                t.status = status;
                topicFound = true;
            }
        });
    });
    if (!topicFound) {
        throw new AppError_1.AppError("Topic not found in this roadmap", 404);
    }
    // Auto-unlock logic
    const completedTopics = new Set();
    milestones.forEach((m) => {
        m.topics.forEach((t) => {
            if (t.status === "completed") {
                completedTopics.add(t.topic_id);
            }
        });
    });
    milestones.forEach((m) => {
        m.topics.forEach((t) => {
            if (t.status === "locked") {
                const prereqs = t.prerequisites || [];
                const allCompleted = prereqs.every((p) => completedTopics.has(p));
                if (allCompleted) {
                    // "available" — matches the schema value used everywhere else
                    // (RoadmapTopic.status: "locked" | "available" | "in_progress" |
                    // "completed"). This used to write "unlocked", a string that
                    // doesn't exist anywhere else in the schema — the frontend's
                    // status->style map had no entry for it, so newly-unlocked
                    // topics rendered with no styling at all.
                    t.status = "available";
                }
            }
        });
    });
    // Recalculate progress
    let totalTopics = 0;
    let completedCount = 0;
    milestones.forEach((m) => {
        m.topics.forEach((t) => {
            totalTopics++;
            if (t.status === "completed") {
                completedCount++;
            }
        });
    });
    const progressPercent = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;
    const updated = await prisma_1.prisma.roadmap.update({
        where: { id: roadmap.id },
        data: {
            milestones: milestones,
            progressPercent,
        },
    });
    return updated;
}
function getResourceLinks(milestoneTitle, domain) {
    const titleLower = milestoneTitle.toLowerCase();
    const resources = [];
    if (titleLower.includes("git") || titleLower.includes("version control") || titleLower.includes("github")) {
        resources.push({ title: "Git Pro Book", url: "https://git-scm.com/book/en/v2", type: "book" }, { title: "Git & GitHub for Beginners", url: "https://www.youtube.com/watch?v=RGOj5yH7evk", type: "video" }, { title: "GitHub Git Cheat Sheet", url: "https://training.github.com/downloads/github-git-cheat-sheet.pdf", type: "article" });
    }
    else if (titleLower.includes("docker") || titleLower.includes("container")) {
        resources.push({ title: "Docker Getting Started Guide", url: "https://docs.docker.com/get-started/", type: "article" }, { title: "Docker Crash Course", url: "https://www.youtube.com/watch?v=pTFZFxd4hOI", type: "video" });
    }
    else if (titleLower.includes("database") || titleLower.includes("sql") || titleLower.includes("postgres") || titleLower.includes("prisma")) {
        resources.push({ title: "SQL Bolt Interactive Tutorial", url: "https://sqlbolt.com/", type: "article" }, { title: "PostgreSQL Tutorial", url: "https://www.postgresqltutorial.com/", type: "book" });
    }
    else if (titleLower.includes("react") || titleLower.includes("frontend") || titleLower.includes("html") || titleLower.includes("css") || titleLower.includes("javascript")) {
        resources.push({ title: "React Dev Documentation", url: "https://react.dev", type: "article" }, { title: "MDN Web Docs: JavaScript", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", type: "article" }, { title: "JavaScript Crash Course", url: "https://www.youtube.com/watch?v=hdI2bqOjy3c", type: "video" });
    }
    else if (titleLower.includes("node") || titleLower.includes("express") || titleLower.includes("backend") || titleLower.includes("api")) {
        resources.push({ title: "Node.js Official Guide", url: "https://nodejs.org/en/learn/getting-started", type: "article" }, { title: "Build APIs with Node & Express", url: "https://www.youtube.com/watch?v=pKd0Rpw7O48", type: "video" });
    }
    else if (titleLower.includes("python") || titleLower.includes("django") || titleLower.includes("fastapi")) {
        resources.push({ title: "Real Python Tutorials", url: "https://realpython.com/", type: "article" }, { title: "Python Crash Course", url: "https://www.youtube.com/watch?v=eWRfhZUzrAM", type: "video" });
    }
    else if (titleLower.includes("dsa") || titleLower.includes("data structure") || titleLower.includes("algorithm")) {
        resources.push({ title: "GeeksforGeeks DSA Guide", url: "https://www.geeksforgeeks.org/data-structures/", type: "article" }, { title: "Data Structures & Algorithms Course", url: "https://www.youtube.com/watch?v=8hly31xKjhc", type: "video" });
    }
    else {
        const query = encodeURIComponent(milestoneTitle);
        resources.push({ title: `MDN Search: ${milestoneTitle}`, url: `https://developer.mozilla.org/en-US/search?q=${query}`, type: "article" }, { title: `YouTube: Learn ${milestoneTitle}`, url: `https://www.youtube.com/results?search_query=${query}`, type: "video" });
    }
    return resources;
}
//# sourceMappingURL=roadmap.service.js.map