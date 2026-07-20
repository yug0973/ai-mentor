import { Router } from "express";
import * as nudgeController from "../controllers/nudge.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

// Mirrors the role guide's GET /nudges/check/{user_id}. Primarily driven
// by the daily cron job (src/cron/nudges.cron.ts), exposed here too so a
// user can manually trigger their own check (e.g. for testing, or a
// "check in on me now" button in the frontend).
router.get("/check/:userId", nudgeController.check);
router.get("/:userId", nudgeController.list);

export default router;
