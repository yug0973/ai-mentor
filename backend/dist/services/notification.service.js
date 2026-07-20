"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = sendNotification;
const logger_1 = require("../config/logger");
const prisma_1 = require("../config/prisma");
const email_service_1 = require("./email.service");
const push_service_1 = require("./push.service");
/**
 * Sends a notification to a user through every channel available for
 * them: email (always, using their account email) and browser push (if
 * they have at least one saved subscription). Each channel fails
 * independently — a broken email send doesn't block push, and vice
 * versa. Callers (the nudge cron job, manual-trigger route) don't need
 * to know which channels succeeded; check the logs for delivery detail.
 */
async function sendNotification(userId, message) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
        logger_1.logger.warn({ userId }, "sendNotification called for unknown user");
        return;
    }
    const [emailSent, pushCount] = await Promise.all([
        (0, email_service_1.sendEmail)(user.email, "A nudge from your AI Mentor", message),
        (0, push_service_1.sendPushToUser)(userId, message),
    ]);
    logger_1.logger.info({ userId, emailSent, pushCount }, "Notification delivery attempted");
}
//# sourceMappingURL=notification.service.js.map