import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { UpsertProfileInput } from "../types/profile.schema";
import { LearnerProfile as EngineLearnerProfile } from "./mentorEngineClient";

export async function upsertProfile(userId: string, input: UpsertProfileInput) {
  return prisma.learnerProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: { ...input },
  });
}

export async function getProfile(userId: string) {
  const profile = await prisma.learnerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError("No learner profile found for this user", 404);
  }
  return profile;
}

/**
 * Maps the persisted Prisma profile into mentor_ai_engine's LearnerProfile
 * shape — snake_case, and `constraints` is a string[] there (vs. a single
 * free-text field in our schema).
 */
export function toEngineProfile(profile: {
  goal: string;
  domain: string;
  currentLevel: string;
  timelineWeeks: number;
  hoursPerWeek: number;
  knownSkills: string[];
  weakAreas: string[];
  preferredLearningStyle: string;
  motivationType: string;
  constraints: string | null;
}): EngineLearnerProfile {
  return {
    goal: profile.goal,
    domain: profile.domain,
    current_level: profile.currentLevel as "beginner" | "intermediate" | "advanced",
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
export function fromEngineProfile(profile: EngineLearnerProfile): UpsertProfileInput {
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
