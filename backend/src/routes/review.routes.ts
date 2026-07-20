import { Router } from "express";
import * as reviewController from "../controllers/review.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

// Mirrors the role guide's POST /reviews/weekly/{user_id}. Primarily
// driven by the weekly cron job (src/cron/weeklyReview.cron.ts), exposed
// here too for manual triggering/testing.
router.post("/weekly/:userId", reviewController.generateWeekly);
router.get("/weekly/:userId", reviewController.listWeekly);
router.get("/mastery/:userId", reviewController.mastery);

export default router;
