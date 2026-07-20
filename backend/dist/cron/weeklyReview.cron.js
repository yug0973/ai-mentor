"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleWeeklyReview = scheduleWeeklyReview;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../config/logger");
const nudge_service_1 = require("../services/nudge.service");
const review_service_1 = require("../services/review.service");
/**
 * Runs once a week, Sunday at 18:00 server time. Iterates every user
 * with a learner profile, generates their weekly review, and persists
 * it plus updated mastery scores. Failures for one user are logged and
 * don't stop the rest of the batch.
 */
function scheduleWeeklyReview() {
    node_cron_1.default.schedule("0 18 * * 0", async () => {
        logger_1.logger.info("Starting weekly review generation");
        const userIds = await (0, nudge_service_1.findActiveUserIds)();
        let succeeded = 0;
        for (const userId of userIds) {
            try {
                await (0, review_service_1.generateAndSaveWeeklyReview)(userId);
                succeeded++;
            }
            catch (err) {
                logger_1.logger.error({ err, userId }, "Weekly review generation failed for user");
            }
        }
        logger_1.logger.info({ total: userIds.length, succeeded }, "Weekly review generation complete");
    });
    logger_1.logger.info("Weekly review scheduled (Sunday 18:00 server time)");
}
//# sourceMappingURL=weeklyReview.cron.js.map