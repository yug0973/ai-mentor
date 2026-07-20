import { Router } from "express";
import * as interviewController from "../controllers/interview.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { respondInterviewSchema, startInterviewSchema } from "../types/interview.schema";

const router = Router();

router.use(requireAuth);

router.post("/", validate(startInterviewSchema), interviewController.start);
router.get("/", interviewController.list);
router.get("/:sessionId", interviewController.get);
router.post(
  "/:sessionId/respond",
  validate(respondInterviewSchema),
  interviewController.respond
);

export default router;
