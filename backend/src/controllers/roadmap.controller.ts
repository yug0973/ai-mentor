import { Request, Response, NextFunction } from "express";
import * as roadmapService from "../services/roadmap.service";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const roadmap = await roadmapService.createRoadmap(req.user!.userId);
    res.status(201).json({ roadmap });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const roadmaps = await roadmapService.listRoadmaps(req.user!.userId);
    res.status(200).json({ roadmaps });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const roadmap = await roadmapService.getRoadmap(req.user!.userId, req.params.roadmapId);
    res.status(200).json({ roadmap });
  } catch (err) {
    next(err);
  }
}

export async function updateProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const roadmap = await roadmapService.updateProgress(
      req.user!.userId,
      req.params.roadmapId,
      req.body.progressPercent
    );
    res.status(200).json({ roadmap });
  } catch (err) {
    next(err);
  }
}

export async function adapt(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await roadmapService.adaptRoadmap(req.user!.userId, req.params.roadmapId, {
      milestoneId: req.body.milestoneId,
      quizId: req.body.quizId,
      scorePercent: req.body.scorePercent,
      topicBreakdown: req.body.topicBreakdown,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateTopicStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const roadmap = await roadmapService.updateTopicStatus(
      req.user!.userId,
      req.params.roadmapId,
      req.params.topicId,
      req.body.status
    );
    res.status(200).json({ roadmap });
  } catch (err) {
    next(err);
  }
}

export async function generateMilestoneQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await roadmapService.generateMilestoneQuiz(
      req.user!.userId,
      req.params.roadmapId,
      req.params.milestoneId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function generateTopicLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await roadmapService.generateTopicLesson(
      req.user!.userId,
      req.params.roadmapId,
      req.params.topicId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

