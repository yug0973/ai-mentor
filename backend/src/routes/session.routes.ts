import { Router } from "express";
import * as sessionController from "../controllers/session.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { createSessionLogSchema } from "../types/session.schema";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createSessionLogSchema), sessionController.create);
router.get("/", sessionController.list);
router.get("/:sessionLogId", sessionController.get);

export default router;
