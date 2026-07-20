import { prisma } from "../config/prisma";
import * as engine from "./mentorEngineClient";
import { sendNotification } from "./notification.service";

/**
 * Users eligible for the daily nudge check. "Active" is defined here as
 * "has completed onboarding" (has a learner profile). Revisit this
 * definition once there's real usage data — e.g. excluding users
 * inactive for 30+ days, or requiring at least one session log.
 */
export async function findActiveUserIds(): Promise<string[]> {
  const profiles = await prisma.learnerProfile.findMany({
    select: { userId: true },
  });
  return profiles.map((p) => p.userId);
}

/**
 * Runs the nudge check for a single user: calls mentor_ai_engine (which
 * now tracks activity itself — no need to build a recent-activity summary
 * on this side), and if a nudge is triggered, persists it to nudges_log
 * and sends a notification. Used by both the daily cron job and the
 * manual-trigger route.
 */
export async function checkAndNudgeUser(userId: string) {
  const result = await engine.checkNudge(userId);

  if (!result.nudge_triggered || !result.nudge_message) {
    return { triggered: false as const };
  }

  const log = await prisma.nudgeLog.create({
    data: {
      userId,
      message: result.nudge_message,
      triggerReason: result.trigger_reason ?? "unspecified",
      suggestedAction: result.suggested_action ?? undefined,
    },
  });

  await sendNotification(userId, result.nudge_message);

  return { triggered: true as const, log };
}

export async function listNudgeLogs(userId: string) {
  return prisma.nudgeLog.findMany({
    where: { userId },
    orderBy: { sentAt: "desc" },
  });
}
