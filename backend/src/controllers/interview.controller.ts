import { Request, Response, NextFunction } from "express";
import * as interviewService from "../services/interview.service";

export async function start(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await interviewService.createInterviewSession(req.user!.userId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function respond(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    const result = await interviewService.continueInterviewSession(
      req.user!.userId,
      sessionId,
      message
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await interviewService.getInterviewSession(
      req.user!.userId,
      req.params.sessionId
    );
    res.status(200).json({ session });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await interviewService.listInterviewSessions(req.user!.userId);
    res.status(200).json({ sessions });
  } catch (err) {
    next(err);
  }
}
