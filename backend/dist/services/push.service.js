"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSubscription = saveSubscription;
exports.removeSubscription = removeSubscription;
exports.sendPushToUser = sendPushToUser;
const web_push_1 = __importDefault(require("web-push"));
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
const prisma_1 = require("../config/prisma");
let configured = false;
function ensureConfigured() {
    if (!env_1.env.VAPID_PUBLIC_KEY || !env_1.env.VAPID_PRIVATE_KEY) {
        return false;
    }
    if (!configured) {
        web_push_1.default.setVapidDetails(env_1.env.VAPID_SUBJECT, env_1.env.VAPID_PUBLIC_KEY, env_1.env.VAPID_PRIVATE_KEY);
        configured = true;
    }
    return true;
}
async function saveSubscription(userId, subscription) {
    return prisma_1.prisma.pushSubscription.upsert({
        where: { endpoint: subscription.endpoint },
        create: {
            userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
        update: {
            userId,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
        },
    });
}
async function removeSubscription(endpoint) {
    await prisma_1.prisma.pushSubscription.deleteMany({ where: { endpoint } });
}
/**
 * Sends a push notification to every device the user has subscribed
 * from. If a subscription has expired or been revoked (410/404 from the
 * push service), it's removed so future sends don't keep failing on it.
 */
async function sendPushToUser(userId, message) {
    if (!ensureConfigured()) {
        logger_1.logger.warn({ userId }, "VAPID keys not configured — push notification not sent");
        return 0;
    }
    const subscriptions = await prisma_1.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) {
        return 0;
    }
    const payload = JSON.stringify({ title: "AI Mentor", body: message });
    let sentCount = 0;
    await Promise.all(subscriptions.map(async (sub) => {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
            await web_push_1.default.sendNotification(pushSubscription, payload);
            sentCount++;
        }
        catch (err) {
            const statusCode = err.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                await removeSubscription(sub.endpoint);
            }
            else {
                logger_1.logger.error({ err, userId, endpoint: sub.endpoint }, "Failed to send push notification");
            }
        }
    }));
    return sentCount;
}
//# sourceMappingURL=push.service.js.map