import { Request, Response, NextFunction } from "express";
import * as profileService from "../services/profile.service";

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileService.upsertProfile(req.user!.userId, req.body);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileService.getProfile(req.user!.userId);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
