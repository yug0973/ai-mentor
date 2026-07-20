import cron from "node-cron";
import { logger } from "../config/logger";
import { findActiveUserIds } from "../services/nudge.service";
import { generateAndSaveWeeklyReview } from "../services/review.service";

/**
 * Runs once a week, Sunday at 18:00 server time. Iterates every user
 * with a learner profile, generates their weekly review, and persists
 * it plus updated mastery scores. Failures for one user are logged and
 * don't stop the rest of the batch.
 */
export function scheduleWeeklyReview() {
  cron.schedule("0 18 * * 0", async () => {
    logger.info("Starting weekly review generation");

    const userIds = await findActiveUserIds();
    let succeeded = 0;

    for (const userId of userIds) {
      try {
        await generateAndSaveWeeklyReview(userId);
        succeeded++;
      } catch (err) {
        logger.error({ err, userId }, "Weekly review generation failed for user");
      }
    }

    logger.info({ total: userIds.length, succeeded }, "Weekly review generation complete");
  });

  logger.info("Weekly review scheduled (Sunday 18:00 server time)");
}
