import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { CreateSessionLogInput } from "../types/session.schema";
import * as engine from "./mentorEngineClient";

export async function logSession(userId: string, input: CreateSessionLogInput) {
  const log = await prisma.sessionLog.create({
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

      await Promise.all(
        result.updated_mastery.map((m) =>
          prisma.masteryScore.upsert({
            where: { userId_topicId: { userId, topicId: m.topic_id } },
            create: { userId, topicId: m.topic_id, masteryScore: m.mastery_score },
            update: { masteryScore: m.mastery_score },
          })
        )
      );
    } catch {
      // Engine-side tracking is a bonus, not a requirement — the local
      // session log above already succeeded, so don't fail the request
      // over this.
    }
  }

  return log;
}

export async function listSessions(userId: string) {
  return prisma.sessionLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });
}

export async function getSession(userId: string, sessionLogId: string) {
  const log = await prisma.sessionLog.findUnique({ where: { id: sessionLogId } });
  if (!log || log.userId !== userId) {
    throw new AppError("Session log not found", 404);
  }
  return log;
}
