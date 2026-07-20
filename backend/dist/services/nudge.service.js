"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findActiveUserIds = findActiveUserIds;
exports.checkAndNudgeUser = checkAndNudgeUser;
exports.listNudgeLogs = listNudgeLogs;
const prisma_1 = require("../config/prisma");
const engine = __importStar(require("./mentorEngineClient"));
const notification_service_1 = require("./notification.service");
/**
 * Users eligible for the daily nudge check. "Active" is defined here as
 * "has completed onboarding" (has a learner profile). Revisit this
 * definition once there's real usage data — e.g. excluding users
 * inactive for 30+ days, or requiring at least one session log.
 */
async function findActiveUserIds() {
    const profiles = await prisma_1.prisma.learnerProfile.findMany({
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
async function checkAndNudgeUser(userId) {
    const result = await engine.checkNudge(userId);
    if (!result.nudge_triggered || !result.nudge_message) {
        return { triggered: false };
    }
    const log = await prisma_1.prisma.nudgeLog.create({
        data: {
            userId,
            message: result.nudge_message,
            triggerReason: result.trigger_reason ?? "unspecified",
            suggestedAction: result.suggested_action ?? undefined,
        },
    });
    await (0, notification_service_1.sendNotification)(userId, result.nudge_message);
    return { triggered: true, log };
}
async function listNudgeLogs(userId) {
    return prisma_1.prisma.nudgeLog.findMany({
        where: { userId },
        orderBy: { sentAt: "desc" },
    });
}
//# sourceMappingURL=nudge.service.js.map