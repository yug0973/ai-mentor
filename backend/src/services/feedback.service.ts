import { prisma } from "../config/prisma";
import * as engine from "./mentorEngineClient";
import { FeedbackEventType } from "./mentorEngineClient";

export interface LogFeedbackEventInput {
  eventType: FeedbackEventType;
  referenceId: string;
  outcomeNote?: string;
}

/**
 * Logs a feedback event with mentor_ai_engine (for its own eval harness,
 * GET /feedback/summary) and mirrors it locally so the frontend can query
 * a user's own feedback history without round-tripping to the engine.
 */
export async function logFeedbackEvent(userId: string, input: LogFeedbackEventInput) {
  const result = await engine.logFeedbackEvent({
    userId,
    eventType: input.eventType,
    referenceId: input.referenceId,
    outcomeNote: input.outcomeNote,
  });

  const stored = await prisma.engineFeedbackEvent.create({
    data: {
      userId,
      eventType: input.eventType,
      referenceId: input.referenceId,
      outcomeNote: input.outcomeNote,
    },
  });

  return { logged: result.logged, event: stored };
}

/**
 * Proxies mentor_ai_engine's eval-harness summary directly — this is
 * explicitly not part of the frozen API contract (an internal ops/eval
 * endpoint, per mentorEngineClient.ts), so it's passed through rather than
 * persisted or reshaped locally.
 */
export async function getFeedbackSummary(userId?: string) {
  return engine.getFeedbackSummary(userId);
}
