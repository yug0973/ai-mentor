import { Router } from "express";
import * as feedbackController from "../controllers/feedback.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { logFeedbackEventSchema } from "../types/feedback.schema";

const router = Router();

router.use(requireAuth);

router.post("/event", validate(logFeedbackEventSchema), feedbackController.logEvent);
router.get("/summary", feedbackController.summary);

export default router;
