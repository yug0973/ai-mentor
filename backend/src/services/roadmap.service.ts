import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import * as engine from "./mentorEngineClient";
import { getProfile, toEngineProfile } from "./profile.service";

export async function createRoadmap(userId: string) {
  const profile = await getProfile(userId);
  const engineProfile = toEngineProfile(profile);

  // NOT idempotent — mentor_ai_engine mints a fresh roadmap_id and (in real
  // mode) runs a real, billed two-pass LLM generation on every call. Do not
  // retry this blindly on a timeout; if retry-safety matters, dedupe on the
  // caller side first.
  const result = await engine.generateRoadmap(userId, engineProfile);

  const roadmap = await prisma.roadmap.create({
    data: {
      userId,
      goal: result.goal,
      milestones: result.milestones as unknown as object,
      progressPercent: result.progress_percent,
      engineRoadmapId: result.roadmap_id,
      generatedFromProfileVersion: result.generated_from_profile_version,
    },
  });

  return roadmap;
}

export async function listRoadmaps(userId: string) {
  return prisma.roadmap.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRoadmap(userId: string, roadmapId: string) {
  const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
  if (!roadmap || roadmap.userId !== userId) {
    throw new AppError("Roadmap not found", 404);
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
export async function generateMilestoneQuiz(
  userId: string,
  roadmapId: string,
  milestoneId: string,
) {
  const roadmap = await getRoadmap(userId, roadmapId);
  const profile = await getProfile(userId);

  const milestones = roadmap.milestones as unknown as engine.RoadmapMilestone[];
  const milestone = milestones.find((m) => m.milestone_id === milestoneId);
  if (!milestone) {
    throw new AppError("Milestone not found on this roadmap", 404);
  }
  if (!milestone.topics.length) {
    throw new AppError("This milestone has no topics to quiz on", 400);
  }

  return engine.generateQuiz(milestoneId, profile.currentLevel, milestone.topics);
}

/**
 * Generates real, domain-aware lesson content for a single topic —
 * replaces the frontend's old hardcoded fake explanation text and fake
 * code snippet that showed up on every topic regardless of subject.
 *
 * NOT cached/idempotent — every call is a real, billed LLM call. The
 * frontend should call this once when the topic study modal opens.
 */
export async function generateTopicLesson(
  userId: string,
  roadmapId: string,
  topicId: string,
) {
  const roadmap = await getRoadmap(userId, roadmapId);
  const profile = await getProfile(userId);

  const milestones = roadmap.milestones as unknown as engine.RoadmapMilestone[];
  let topic: engine.RoadmapTopic | undefined;
  for (const m of milestones) {
    topic = m.topics.find((t) => t.topic_id === topicId);
    if (topic) break;
  }
  if (!topic) {
    throw new AppError("Topic not found on this roadmap", 404);
  }

  return engine.generateLesson(topic, profile.domain, profile.currentLevel);
}

export async function updateProgress(userId: string, roadmapId: string, progressPercent: number) {
  const roadmap = await getRoadmap(userId, roadmapId);

  return prisma.roadmap.update({
    where: { id: roadmap.id },
    data: { progressPercent },
  });
}

export interface AdaptRoadmapInput {
  milestoneId: string;
  quizId: string;
  scorePercent: number;
  topicBreakdown?: Record<string, number>;
}

export async function adaptRoadmap(userId: string, roadmapId: string, input: AdaptRoadmapInput) {
  const roadmap = await getRoadmap(userId, roadmapId);
  if (!roadmap.engineRoadmapId) {
    // Roadmaps created before this integration have no engine-side roadmap
    // to adapt against — nothing to do but say so clearly.
    throw new AppError(
      "This roadmap has no associated mentor_ai_engine roadmap_id and cannot be adapted.",
      409
    );
  }

  const result = await engine.adaptRoadmap({
    userId,
    roadmapId: roadmap.engineRoadmapId,
    milestoneId: input.milestoneId,
    quizId: input.quizId,
    scorePercent: input.scorePercent,
    topicBreakdown: input.topicBreakdown,
  });

  const updatedMilestones = result.updated_roadmap.milestones;

  const updated = await prisma.roadmap.update({
    where: { id: roadmap.id },
    data: { milestones: updatedMilestones as unknown as object },
  });

  if (result.changed) {
    await prisma.engineFeedbackEvent.create({
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

export async function updateTopicStatus(
  userId: string,
  roadmapId: string,
  topicId: string,
  status: "locked" | "completed" | "available" | "in_progress"
) {
  const roadmap = await getRoadmap(userId, roadmapId);
  const milestones = (roadmap.milestones as any[]) || [];

  let topicFound = false;
  milestones.forEach((m) => {
    m.topics.forEach((t: any) => {
      if (t.topic_id === topicId) {
        t.status = status;
        topicFound = true;
      }
    });
  });

  if (!topicFound) {
    throw new AppError("Topic not found in this roadmap", 404);
  }

  // Auto-unlock logic
  const completedTopics = new Set<string>();
  milestones.forEach((m) => {
    m.topics.forEach((t: any) => {
      if (t.status === "completed") {
        completedTopics.add(t.topic_id);
      }
    });
  });

  milestones.forEach((m) => {
    m.topics.forEach((t: any) => {
      if (t.status === "locked") {
        const prereqs = t.prerequisites || [];
        const allCompleted = prereqs.every((p: string) => completedTopics.has(p));
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
    m.topics.forEach((t: any) => {
      totalTopics++;
      if (t.status === "completed") {
        completedCount++;
      }
    });
  });

  const progressPercent = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  const updated = await prisma.roadmap.update({
    where: { id: roadmap.id },
    data: {
      milestones: milestones as unknown as object,
      progressPercent,
    },
  });

  return updated;
}

