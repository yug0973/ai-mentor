import { Router } from "express";
import * as roadmapController from "../controllers/roadmap.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { updateProgressSchema, adaptRoadmapSchema, updateTopicStatusSchema } from "../types/roadmap.schema";

const router = Router();

router.use(requireAuth);

router.post("/", roadmapController.create);
router.get("/", roadmapController.list);
router.get("/:roadmapId", roadmapController.get);
router.patch(
  "/:roadmapId/progress",
  validate(updateProgressSchema),
  roadmapController.updateProgress
);
router.patch(
  "/:roadmapId/adapt",
  validate(adaptRoadmapSchema),
  roadmapController.adapt
);
router.patch(
  "/:roadmapId/topics/:topicId",
  validate(updateTopicStatusSchema),
  roadmapController.updateTopicStatus
);
router.post(
  "/:roadmapId/milestones/:milestoneId/quiz",
  roadmapController.generateMilestoneQuiz
);
router.post(
  "/:roadmapId/topics/:topicId/lesson",
  roadmapController.generateTopicLesson
);

export default router;
