import { prisma } from "../config/prisma";
import * as engine from "./mentorEngineClient";

/**
 * Runs the weekly review for a single user via mentor_ai_engine, and
 * persists it. NOTE: the engine's WeeklyReviewResponse shape
 * (sessions_completed, total_hours, topics_improved/stagnant,
 * goal_progress_percent, next_week_focus, motivational_insight) is
 * different from what the old mentor-brain contract returned
 * (summary/recommendations/masteryScores), which is what feedback_events'
 * columns were originally shaped around. Rather than migrate that table,
 * this maps the new fields into the existing columns:
 *   - summary            <- motivational_insight
 *   - recommendations    <- the rest of the structured fields, as JSON
 *   - masteryScoresSnapshot <- {} (per-topic scores now come from the
 *     session tracker's logSession() calls instead — see session.service.ts)
 * Used by both the weekly cron job and the manual-trigger route.
 */
export async function generateAndSaveWeeklyReview(userId: string) {
  const result = await engine.generateWeeklyReview(userId);

  const feedbackEvent = await prisma.feedbackEvent.create({
    data: {
      userId,
      summary: result.motivational_insight,
      recommendations: {
        weekStart: result.week_start,
        weekEnd: result.week_end,
        sessionsCompleted: result.sessions_completed,
        totalHours: result.total_hours,
        topicsImproved: result.topics_improved,
        topicsStagnant: result.topics_stagnant,
        goalProgressPercent: result.goal_progress_percent,
        nextWeekFocus: result.next_week_focus,
      },
      masteryScoresSnapshot: {},
    },
  });

  return feedbackEvent;
}

export async function listWeeklyReviews(userId: string) {
  return prisma.feedbackEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listMasteryScores(userId: string) {
  return prisma.masteryScore.findMany({
    where: { userId },
    orderBy: { topicId: "asc" },
  });
}
