import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import * as engine from "./mentorEngineClient";
import { upsertProfile, fromEngineProfile } from "./profile.service";

/**
 * mentor_ai_engine's interview flow is the reverse of the old mentor-brain
 * one: no LearnerProfile is needed to start — the interview itself builds
 * one, handed back as `learner_profile` on the turn where status flips to
 * "complete". This is why `createInterviewSession` below no longer calls
 * getProfile() first.
 */
export async function createInterviewSession(userId: string) {
  const startRes = await engine.startInterview();

  const session = await prisma.interviewSession.create({
    data: {
      userId,
      status: "IN_PROGRESS",
      engineSessionId: startRes.session_id,
      conversationHistory: [{ role: "assistant", content: startRes.mentor_message }],
    },
  });

  return {
    session,
    question: startRes.mentor_message,
  };
}

export async function continueInterviewSession(
  userId: string,
  sessionId: string,
  message: string
) {
  const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });

  if (!session || session.userId !== userId) {
    throw new AppError("Interview session not found", 404);
  }
  if (session.status !== "IN_PROGRESS") {
    throw new AppError("This interview session has already ended", 409);
  }

  const history = Array.isArray(session.conversationHistory)
    ? [...(session.conversationHistory as unknown[])]
    : [];
  history.push({ role: "user", content: message });

  if (!session.engineSessionId) {
    throw new AppError(
      "This session predates mentor_ai_engine integration and cannot be continued.",
      409
    );
  }

  let sendRes;
  try {
    sendRes = await engine.sendInterviewMessage(session.engineSessionId, message);
  } catch (err: any) {
    if (err.status === 404) {
      const restartResult = await engine.startInterview();
      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: { engineSessionId: restartResult.session_id },
      });
      sendRes = await engine.sendInterviewMessage(restartResult.session_id, message);
    } else {
      throw err;
    }
  }

  const isComplete = sendRes.status === "complete";

  if (isComplete) {
    if (sendRes.learner_profile) {
      await upsertProfile(userId, fromEngineProfile(sendRes.learner_profile));
    }
  } else if (sendRes.mentor_message) {
    history.push({ role: "assistant", content: sendRes.mentor_message });
  }

  const updated = await prisma.interviewSession.update({
    where: { id: sessionId },
    data: {
      conversationHistory: history as object,
      status: isComplete ? "COMPLETED" : "IN_PROGRESS",
    },
  });

  return {
    session: updated,
    question: sendRes.mentor_message ?? null,
    isComplete,
    learnerProfile: sendRes.learner_profile ?? null,
  };
}

export async function getInterviewSession(userId: string, sessionId: string) {
  const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw new AppError("Interview session not found", 404);
  }
  return session;
}

export async function listInterviewSessions(userId: string) {
  return prisma.interviewSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
