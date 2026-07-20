import { Request, Response, NextFunction } from "express";
import * as sessionService from "../services/session.service";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await sessionService.logSession(req.user!.userId, req.body);
    res.status(201).json({ log });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await sessionService.listSessions(req.user!.userId);
    res.status(200).json({ logs });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await sessionService.getSession(req.user!.userId, req.params.sessionLogId);
    res.status(200).json({ log });
  } catch (err) {
    next(err);
  }
}
