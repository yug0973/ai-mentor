import { Request, Response, NextFunction } from "express";
import * as feedbackService from "../services/feedback.service";

export async function logEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await feedbackService.logFeedbackEvent(req.user!.userId, {
      eventType: req.body.eventType,
      referenceId: req.body.referenceId,
      outcomeNote: req.body.outcomeNote,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    // Self-only — a user can only see their own summary through this
    // route. A separate internal/admin path would be needed for
    // cross-user aggregate summaries.
    const result = await feedbackService.getFeedbackSummary(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
