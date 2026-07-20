import { Router } from "express";
import * as pushController from "../controllers/push.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { subscribeSchema, unsubscribeSchema } from "../types/push.schema";

const router = Router();

// Public — the frontend needs this before the user is necessarily logged
// in, to set up the browser's push manager.
router.get("/vapid-public-key", pushController.getPublicKey);

router.use(requireAuth);

router.post("/subscribe", validate(subscribeSchema), pushController.subscribe);
router.post("/unsubscribe", validate(unsubscribeSchema), pushController.unsubscribe);

export default router;
