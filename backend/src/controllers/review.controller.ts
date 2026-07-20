import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import * as reviewService from "../services/review.service";

function assertSelf(req: Request) {
  if (req.user!.userId !== req.params.userId) {
    throw new AppError("You can only trigger reviews for your own account", 403);
  }
}

export async function generateWeekly(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelf(req);
    const review = await reviewService.generateAndSaveWeeklyReview(req.params.userId);
    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
}

export async function listWeekly(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelf(req);
    const reviews = await reviewService.listWeeklyReviews(req.params.userId);
    res.status(200).json({ reviews });
  } catch (err) {
    next(err);
  }
}

export async function mastery(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelf(req);
    const scores = await reviewService.listMasteryScores(req.params.userId);
    res.status(200).json({ scores });
  } catch (err) {
    next(err);
  }
}
