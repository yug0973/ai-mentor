import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import * as nudgeService from "../services/nudge.service";

function assertSelf(req: Request) {
  if (req.user!.userId !== req.params.userId) {
    throw new AppError("You can only trigger nudge checks for your own account", 403);
  }
}

export async function check(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelf(req);
    const result = await nudgeService.checkAndNudgeUser(req.params.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelf(req);
    const logs = await nudgeService.listNudgeLogs(req.params.userId);
    res.status(200).json({ logs });
  } catch (err) {
    next(err);
  }
}
