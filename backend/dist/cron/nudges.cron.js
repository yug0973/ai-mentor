"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleNudgeCheck = scheduleNudgeCheck;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../config/logger");
const nudge_service_1 = require("../services/nudge.service");
/**
 * Runs once a day at 08:00 server time. Iterates every user with a
 * learner profile, checks whether a nudge should fire, and persists +
 * notifies for each one that does. Failures for one user are logged and
 * don't stop the rest of the batch.
 */
function scheduleNudgeCheck() {
    node_cron_1.default.schedule("0 8 * * *", async () => {
        logger_1.logger.info("Starting daily nudge check");
        const userIds = await (0, nudge_service_1.findActiveUserIds)();
        let triggeredCount = 0;
        for (const userId of userIds) {
            try {
                const result = await (0, nudge_service_1.checkAndNudgeUser)(userId);
                if (result.triggered)
                    triggeredCount++;
            }
            catch (err) {
                logger_1.logger.error({ err, userId }, "Nudge check failed for user");
            }
        }
        logger_1.logger.info({ checked: userIds.length, triggered: triggeredCount }, "Daily nudge check complete");
    });
    logger_1.logger.info("Daily nudge check scheduled (08:00 server time)");
}
//# sourceMappingURL=nudges.cron.js.map