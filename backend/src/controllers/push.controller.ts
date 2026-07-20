import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import * as pushService from "../services/push.service";

export async function getPublicKey(_req: Request, res: Response) {
  res.status(200).json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
}

export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const subscription = await pushService.saveSubscription(req.user!.userId, req.body);
    res.status(201).json({ subscription });
  } catch (err) {
    next(err);
  }
}

export async function unsubscribe(req: Request, res: Response, next: NextFunction) {
  try {
    await pushService.removeSubscription(req.body.endpoint);
    res.status(200).json({ message: "Unsubscribed" });
  } catch (err) {
    next(err);
  }
}
