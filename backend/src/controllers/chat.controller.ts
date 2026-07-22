import { Request, Response, NextFunction } from "express";
import * as chatService from "../services/chat.service";

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await chatService.sendChatMessage(req.user!.userId, req.body.message);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function history(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await chatService.getChatHistory(req.user!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
