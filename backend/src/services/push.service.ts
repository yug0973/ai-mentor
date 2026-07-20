import webpush, { PushSubscription as WebPushSubscription } from "web-push";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";

let configured = false;

function ensureConfigured(): boolean {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(userId: string, subscription: PushSubscriptionInput) {
  return prisma.pushSubscription.upsert({
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

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/**
 * Sends a push notification to every device the user has subscribed
 * from. If a subscription has expired or been revoked (410/404 from the
 * push service), it's removed so future sends don't keep failing on it.
 */
export async function sendPushToUser(userId: string, message: string): Promise<number> {
  if (!ensureConfigured()) {
    logger.warn({ userId }, "VAPID keys not configured — push notification not sent");
    return 0;
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) {
    return 0;
  }

  const payload = JSON.stringify({ title: "AI Mentor", body: message });
  let sentCount = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        sentCount++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(sub.endpoint);
        } else {
          logger.error({ err, userId, endpoint: sub.endpoint }, "Failed to send push notification");
        }
      }
    })
  );

  return sentCount;
}
