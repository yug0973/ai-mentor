import { Router } from "express";
import * as profileController from "../controllers/profile.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { upsertProfileSchema } from "../types/profile.schema";

const router = Router();

router.use(requireAuth);

router.put("/", validate(upsertProfileSchema), profileController.upsert);
router.get("/", profileController.get);

export default router;
