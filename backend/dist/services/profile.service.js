"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertProfile = upsertProfile;
exports.getProfile = getProfile;
exports.toEngineProfile = toEngineProfile;
exports.fromEngineProfile = fromEngineProfile;
const prisma_1 = require("../config/prisma");
const AppError_1 = require("../utils/AppError");
async function upsertProfile(userId, input) {
    return prisma_1.prisma.learnerProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: { ...input },
    });
}
async function getProfile(userId) {
    const profile = await prisma_1.prisma.learnerProfile.findUnique({ where: { userId } });
    if (!profile) {
        throw new AppError_1.AppError("No learner profile found for this user", 404);
    }
    return profile;
}
/**
 * Maps the persisted Prisma profile into mentor_ai_engine's LearnerProfile
 * shape — snake_case, and `constraints` is a string[] there (vs. a single
 * free-text field in our schema).
 */
function toEngineProfile(profile) {
    return {
        goal: profile.goal,
        domain: profile.domain,
        current_level: profile.currentLevel,
        timeline_weeks: profile.timelineWeeks,
        hours_per_week: profile.hoursPerWeek,
        known_skills: profile.knownSkills,
        weak_areas: profile.weakAreas,
        preferred_learning_style: profile.preferredLearningStyle,
        motivation_type: profile.motivationType,
        constraints: profile.constraints ? [profile.constraints] : [],
    };
}
/**
 * Maps mentor_ai_engine's completed-interview LearnerProfile output back
 * into our upsert input shape — the reverse of toEngineProfile(). Used
 * when an interview finishes and the engine hands back a profile it built
 * from the conversation, which we then persist as this user's profile.
 */
function fromEngineProfile(profile) {
    return {
        goal: profile.goal,
        domain: profile.domain,
        currentLevel: profile.current_level,
        timelineWeeks: profile.timeline_weeks,
        hoursPerWeek: profile.hours_per_week,
        knownSkills: profile.known_skills,
        weakAreas: profile.weak_areas,
        preferredLearningStyle: profile.preferred_learning_style ?? "unspecified",
        motivationType: profile.motivation_type ?? "unspecified",
        constraints: profile.constraints?.[0],
    };
}
//# sourceMappingURL=profile.service.js.map