import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { sendEmail } from "./email.service";
import { sendPushToUser } from "./push.service";

/**
 * Sends a notification to a user through every channel available for
 * them: email (always, using their account email) and browser push (if
 * they have at least one saved subscription). Each channel fails
 * independently — a broken email send doesn't block push, and vice
 * versa. Callers (the nudge cron job, manual-trigger route) don't need
 * to know which channels succeeded; check the logs for delivery detail.
 */
export async function sendNotification(userId: string, message: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  if (!user) {
    logger.warn({ userId }, "sendNotification called for unknown user");
    return;
  }

  const [emailSent, pushCount] = await Promise.all([
    sendEmail(user.email, "A nudge from your AI Mentor", message),
    sendPushToUser(userId, message),
  ]);

  logger.info({ userId, emailSent, pushCount }, "Notification delivery attempted");
}
