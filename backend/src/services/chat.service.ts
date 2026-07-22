import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import * as engine from "./mentorEngineClient";
import { getProfile, toEngineProfile } from "./profile.service";

const HISTORY_TURNS_TO_SEND = 12;

export async function sendChatMessage(userId: string, message: string) {
  if (!message || !message.trim()) {
    throw new AppError("Message cannot be empty", 400);
  }

  const profile = await getProfile(userId);
  const engineProfile = toEngineProfile(profile);

  const dbRoadmap = await prisma.roadmap.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const masteryScores = await prisma.masteryScore.findMany({ where: { userId } });

  const recentHistory = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS_TO_SEND,
  });
  const orderedHistory = recentHistory.reverse();

  const engineRoadmap: engine.Roadmap | null = dbRoadmap
    ? {
        roadmap_id: dbRoadmap.engineRoadmapId ?? dbRoadmap.id,
        user_id: userId,
        goal: dbRoadmap.goal,
        milestones: dbRoadmap.milestones as unknown as engine.RoadmapMilestone[],
        progress_percent: dbRoadmap.progressPercent,
        generated_from_profile_version: dbRoadmap.generatedFromProfileVersion ?? "v1",
      }
    : null;

  const engineResult = await engine.chatWithMentor({
    userId,
    message,
    learnerProfile: engineProfile,
    roadmap: engineRoadmap,
    masteryScores: masteryScores.map((m) => ({
      topic_id: m.topicId,
      mastery_score: m.masteryScore,
      last_updated: m.lastUpdated.toISOString(),
    })),
    conversationHistory: orderedHistory.map((h) => ({
      role: h.role as "user" | "mentor",
      content: h.content,
    })),
  });

  const [userMessage, mentorMessage] = await prisma.$transaction([
    prisma.chatMessage.create({ data: { userId, role: "user", content: message } }),
    prisma.chatMessage.create({ data: { userId, role: "mentor", content: engineResult.reply } }),
  ]);

  // If the chat pinpointed a struggle and the engine spliced in remedial
  // topics, persist it the exact same way adaptRoadmap() does — same
  // table, same fields, no second/diverging save path.
  let updatedRoadmap = null;
  if (engineResult.changed && engineResult.updated_roadmap && dbRoadmap) {
    updatedRoadmap = await prisma.roadmap.update({
      where: { id: dbRoadmap.id },
      data: {
        milestones: engineResult.updated_roadmap.milestones as unknown as object,
        progressPercent: engineResult.updated_roadmap.progress_percent,
      },
    });

    await prisma.engineFeedbackEvent.create({
      data: {
        userId,
        eventType: "roadmap_change_accepted",
        referenceId: dbRoadmap.engineRoadmapId ?? dbRoadmap.id,
        outcomeNote: engineResult.change_summary,
      },
    });
  }

  return {
    userMessage,
    mentorMessage,
    roadmapChanged: engineResult.changed,
    changeSummary: engineResult.change_summary,
    updatedRoadmap,
  };
}

export async function getChatHistory(userId: string) {
  return prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}