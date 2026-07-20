import cron from "node-cron";
import { logger } from "../config/logger";
import { findActiveUserIds, checkAndNudgeUser } from "../services/nudge.service";

/**
 * Runs once a day at 08:00 server time. Iterates every user with a
 * learner profile, checks whether a nudge should fire, and persists +
 * notifies for each one that does. Failures for one user are logged and
 * don't stop the rest of the batch.
 */
export function scheduleNudgeCheck() {
  cron.schedule("0 8 * * *", async () => {
    logger.info("Starting daily nudge check");

    const userIds = await findActiveUserIds();
    let triggeredCount = 0;

    for (const userId of userIds) {
      try {
        const result = await checkAndNudgeUser(userId);
        if (result.triggered) triggeredCount++;
      } catch (err) {
        logger.error({ err, userId }, "Nudge check failed for user");
      }
    }

    logger.info(
      { checked: userIds.length, triggered: triggeredCount },
      "Daily nudge check complete"
    );
  });

  logger.info("Daily nudge check scheduled (08:00 server time)");
}
